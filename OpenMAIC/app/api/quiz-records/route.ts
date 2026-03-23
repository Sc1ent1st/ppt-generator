/**
 * Quiz Records API
 *
 * GET /api/quiz-records?classroomId=xxx  — list all records for a classroom
 * GET /api/quiz-records?classroomId=xxx&summary=1  — summary stats
 */

import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const RECORDS_DIR = path.join(process.cwd(), 'data', 'quiz-records');

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const classroomId = searchParams.get('classroomId');
  const summary = searchParams.get('summary') === '1';

  if (!classroomId) {
    // List all classrooms that have records
    try {
      const files = await fs.readdir(RECORDS_DIR).catch(() => []);
      const classrooms = files.filter(f => f.endsWith('.jsonl')).map(f => f.replace('.jsonl', ''));
      return apiSuccess({ classrooms });
    } catch {
      return apiSuccess({ classrooms: [] });
    }
  }

  const filePath = path.join(RECORDS_DIR, `${classroomId}.jsonl`);
  let records: any[] = [];

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    records = raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch {
    return apiSuccess({ classroomId, records: [], total: 0 });
  }

  if (!summary) {
    return apiSuccess({ classroomId, records, total: records.length });
  }

  // Summary stats
  const total = records.length;
  const avgPct = total > 0 ? Math.round(records.reduce((s, r) => s + r.percentage, 0) / total) : 0;
  const avgScore = total > 0 ? Math.round(records.reduce((s, r) => s + r.earnedPoints, 0) / total * 10) / 10 : 0;
  const passCount = records.filter(r => r.percentage >= 60).length;

  // Per-student best score
  const byStudent: Record<string, any> = {};
  for (const r of records) {
    const key = r.studentId || r.studentName || 'anonymous';
    if (!byStudent[key] || r.percentage > byStudent[key].percentage) {
      byStudent[key] = { studentId: r.studentId, studentName: r.studentName, percentage: r.percentage, earnedPoints: r.earnedPoints, totalPoints: r.totalPoints, submittedAt: r.submittedAt, attempts: 0 };
    }
    byStudent[key].attempts = (byStudent[key].attempts || 0) + 1;
  }

  return apiSuccess({
    classroomId,
    total,
    avgScore,
    avgPercentage: avgPct,
    passCount,
    passRate: total > 0 ? Math.round(passCount / total * 100) : 0,
    studentCount: Object.keys(byStudent).length,
    students: Object.values(byStudent),
  });
}
