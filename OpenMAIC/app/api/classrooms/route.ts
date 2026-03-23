/**
 * Classrooms List API
 * GET /api/classrooms — list all classrooms with basic info
 */
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { CLASSROOMS_DIR } from '@/lib/server/classroom-storage';

export async function GET(_req: NextRequest) {
  try {
    const files = await fs.readdir(CLASSROOMS_DIR).catch(() => [] as string[]);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const classrooms = await Promise.all(
      jsonFiles.map(async f => {
        try {
          const content = await fs.readFile(path.join(CLASSROOMS_DIR, f), 'utf-8');
          const data = JSON.parse(content);
          const scenes: any[] = data.scenes || [];
          const quizScenes = scenes.filter((s: any) => s.type === 'quiz');
          return {
            id: data.id || f.replace('.json', ''),
            name: data.stage?.name || data.name || f.replace('.json', ''),
            language: data.stage?.language || 'zh-CN',
            style: data.stage?.style || '',
            createdAt: data.createdAt || data.stage?.createdAt || null,
            sceneCount: scenes.length,
            quizCount: quizScenes.length,
          };
        } catch {
          return null;
        }
      }),
    );

    const valid = classrooms
      .filter(Boolean)
      .sort((a, b) => {
        const ta = a!.createdAt ? new Date(a!.createdAt).getTime() : 0;
        const tb = b!.createdAt ? new Date(b!.createdAt).getTime() : 0;
        return tb - ta;
      });

    return apiSuccess({ classrooms: valid });
  } catch (error) {
    return apiError('INTERNAL_ERROR', 500, 'Failed to list classrooms', String(error));
  }
}
