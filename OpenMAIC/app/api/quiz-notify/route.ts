/**
 * Quiz Notify API
 *
 * POST: Receives quiz results, saves to local records file, and sends a Daxiang notification.
 */

import { NextRequest } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('Quiz Notify');
const execFileAsync = promisify(execFile);

const DX_CLIENT_ID = process.env.DX_CLIENT_ID || '48e73268b7';
const DX_CLIENT_SECRET = process.env.DX_CLIENT_SECRET || 'cea268943c8a40c08cfd2a80ebbaf62b';
const TEACHER_MIS = process.env.QUIZ_NOTIFY_MIS || 'wangjinyan08';
const SEND_SCRIPT = '/root/.openclaw/skills/daxiang-sender/scripts/send.py';
const RECORDS_DIR = path.join(process.cwd(), 'data', 'quiz-records');

interface QuestionResult {
  questionId: string;
  status: 'correct' | 'incorrect' | 'partial' | 'skipped';
  earned: number;
}

interface NotifyRequest {
  classroomId: string;
  sceneId?: string;
  classroomTitle?: string;
  studentName?: string;
  studentId?: string;
  totalPoints: number;
  earnedPoints: number;
  results: QuestionResult[];
}

interface QuizRecord {
  id: string;
  classroomId: string;
  sceneId?: string;
  classroomTitle?: string;
  studentName?: string;
  studentId?: string;
  totalPoints: number;
  earnedPoints: number;
  percentage: number;
  results: QuestionResult[];
  submittedAt: string;
}

async function saveRecord(record: QuizRecord): Promise<void> {
  await fs.mkdir(RECORDS_DIR, { recursive: true });
  // One file per classroom, append records as JSON lines
  const filePath = path.join(RECORDS_DIR, `${record.classroomId}.jsonl`);
  await fs.appendFile(filePath, JSON.stringify(record) + '\n', 'utf-8');
  log.info(`Saved quiz record to ${filePath}`);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as NotifyRequest;
    const { classroomId, sceneId, classroomTitle, studentName, studentId, totalPoints, earnedPoints, results } = body;

    const pct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const correctCount = results.filter((r) => r.status === 'correct').length;
    const incorrectCount = results.filter((r) => r.status === 'incorrect').length;
    const partialCount = results.filter((r) => r.status === 'partial').length;

    // Save record
    const record: QuizRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      classroomId,
      sceneId,
      classroomTitle,
      studentName,
      studentId,
      totalPoints,
      earnedPoints,
      percentage: pct,
      results,
      submittedAt: new Date().toISOString(),
    };
    await saveRecord(record);

    // Send Daxiang notification
    const studentLabel = studentName || studentId || '匿名学员';
    const titleLabel = classroomTitle || classroomId;

    const message = [
      `📊 学员答题通知`,
      `课堂：${titleLabel}`,
      `学员：${studentLabel}`,
      `得分：${earnedPoints}/${totalPoints} 分（${pct}%）`,
      `正确 ${correctCount} 题 / 错误 ${incorrectCount} 题 / 部分得分 ${partialCount} 题`,
      `课堂链接：https://3000-1bjiovj7jviuytsw41lf.ap2.catclaw.sankuai.com/classroom/${classroomId}`,
    ].join('\n');

    const { stdout, stderr } = await execFileAsync('python3', [
      SEND_SCRIPT,
      '--client-id', DX_CLIENT_ID,
      '--client-secret', DX_CLIENT_SECRET,
      '--to', TEACHER_MIS,
      '--text', message,
    ], { timeout: 15000 });

    log.info('Notification sent:', stdout);
    if (stderr) log.warn('stderr:', stderr);

    return apiSuccess({ notified: true, recordId: record.id });
  } catch (error) {
    log.error('Quiz notify error:', error);
    return apiSuccess({ notified: false, error: String(error) });
  }
}
