'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Users,
  ClipboardList,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  GraduationCap,
  LayoutGrid,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ClassroomInfo {
  id: string;
  name: string;
  language: string;
  style: string;
  createdAt: string | null;
  sceneCount: number;
  quizCount: number;
}

interface QuizRecord {
  id: string;
  classroomId: string;
  sceneId: string;
  studentId: string;
  totalPoints: number;
  earnedPoints: number;
  percentage: number;
  results: { questionId: string; status: string; earned: number }[];
  submittedAt: string;
}

interface StudentSummary {
  studentId: string;
  attempts: number;
  percentage: number;
  earnedPoints: number;
  totalPoints: number;
  submittedAt: string;
}

function ClassroomCard({ classroom, onClick }: { classroom: ClassroomInfo; onClick: () => void }) {
  const date = classroom.createdAt
    ? new Date(classroom.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    : null;
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-800 transition-all duration-200 p-5 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="size-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
          <GraduationCap className="size-5 text-white" />
        </div>
        <ChevronRight className="size-4 text-gray-300 dark:text-gray-600 group-hover:text-violet-400 transition-colors mt-1 shrink-0" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug line-clamp-2">
          {classroom.name}
        </h3>
        {date && <p className="text-xs text-gray-400 mt-1">{date}</p>}
      </div>
      <div className="flex items-center gap-3 pt-1 border-t border-gray-50 dark:border-gray-800">
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <LayoutGrid className="size-3" />
          {classroom.sceneCount} 个场景
        </span>
        {classroom.quizCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-violet-500 dark:text-violet-400">
            <ClipboardList className="size-3" />
            {classroom.quizCount} 个测验
          </span>
        )}
      </div>
    </div>
  );
}

function StudentRow({
  student,
  onGenerate,
  generating,
}: {
  student: StudentSummary;
  onGenerate: () => void;
  generating: boolean;
}) {
  const passed = student.percentage >= 60;
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <div className="size-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center shrink-0">
        <Users className="size-4 text-slate-500 dark:text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{student.studentId}</p>
        <p className="text-xs text-gray-400">
          答题 {student.attempts} 次 · {new Date(student.submittedAt).toLocaleDateString('zh-CN')}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
            passed
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',
          )}
        >
          {passed ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
          {student.percentage}%
        </div>
        {!passed && (
          <Button
            size="sm"
            variant="outline"
            onClick={onGenerate}
            disabled={generating}
            className="h-7 text-xs gap-1 border-violet-200 text-violet-600 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-900/20"
          >
            {generating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            生成补课
          </Button>
        )}
      </div>
    </div>
  );
}

function ClassroomDetail({ classroom, onBack }: { classroom: ClassroomInfo; onBack: () => void }) {
  const router = useRouter();
  const [records, setRecords] = useState<QuizRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/quiz-records?classroomId=' + classroom.id)
      .then(r => r.json())
      .then(d => setRecords(d.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [classroom.id]);

  const studentMap: Record<string, StudentSummary> = {};
  for (const r of records) {
    const key = r.studentId || 'anonymous';
    if (!studentMap[key] || r.percentage > studentMap[key].percentage) {
      studentMap[key] = {
        studentId: key,
        attempts: 0,
        percentage: r.percentage,
        earnedPoints: r.earnedPoints,
        totalPoints: r.totalPoints,
        submittedAt: r.submittedAt,
      };
    }
    studentMap[key].attempts = (studentMap[key].attempts || 0) + 1;
  }
  const students = Object.values(studentMap).sort((a, b) => a.percentage - b.percentage);

  const handleGenerate = useCallback(async (studentId: string) => {
    setGeneratingFor(studentId);
    try {
      const res = await fetch('/api/remedial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId: classroom.id, studentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message || '生成失败');
        return;
      }
      const newId = data.id;
      toast.success('补课课堂已生成（' + data.sceneCount + ' 个场景）', {
        action: { label: '立即查看', onClick: () => router.push('/classroom/' + newId) },
      });
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setGeneratingFor(null);
    }
  }, [classroom.id, router]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="size-8 rounded-lg border border-gray-100 dark:border-gray-800 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="size-4 text-gray-500" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-tight truncate">
            {classroom.name}
          </h2>
          <p className="text-xs text-gray-400">{classroom.sceneCount} 个场景 · {classroom.quizCount} 个测验</p>
        </div>
        <Button size="sm" onClick={() => router.push('/classroom/' + classroom.id)} className="shrink-0 gap-1">
          <BookOpen className="size-3.5" />
          进入课堂
        </Button>
      </div>

      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-800 flex items-center gap-2">
          <ClipboardList className="size-4 text-violet-500" />
          <span className="font-medium text-sm text-gray-800 dark:text-gray-200">学生答题情况</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="size-5 animate-spin mr-2" />加载中...
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <AlertCircle className="size-8 opacity-40" />
            <p className="text-sm">暂无答题记录</p>
          </div>
        ) : (
          <div className="px-5">
            {students.map(s => (
              <StudentRow
                key={s.studentId}
                student={s}
                onGenerate={() => handleGenerate(s.studentId)}
                generating={generatingFor === s.studentId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<ClassroomInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ClassroomInfo | null>(null);

  useEffect(() => {
    fetch('/api/classrooms')
      .then(r => r.json())
      .then(d => setClassrooms(d.classrooms || []))
      .catch(() => setClassrooms([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="size-4" />
            返回首页
          </button>
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">课堂管理</span>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {selected ? (
          <ClassroomDetail classroom={selected} onBack={() => setSelected(null)} />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">所有课堂</h1>
              <p className="text-sm text-gray-500 mt-1">{classrooms.length > 0 ? '共 ' + classrooms.length + ' 个课堂' : ''}</p>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-24 text-gray-400">
                <Loader2 className="size-6 animate-spin mr-2" />加载中...
              </div>
            ) : classrooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
                <GraduationCap className="size-12 opacity-30" />
                <p className="text-sm">还没有课堂，去首页生成一个吧</p>
                <Button variant="outline" size="sm" onClick={() => router.push('/')}>去创建</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {classrooms.map(c => (
                  <ClassroomCard key={c.id} classroom={c} onClick={() => setSelected(c)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
