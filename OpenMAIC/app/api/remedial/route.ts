/**
 * Remedial Classroom API
 *
 * POST /api/remedial
 * Body: { classroomId, studentId }
 * Returns: new classroom id with scenes targeting wrong answers
 */
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  CLASSROOMS_DIR,
  persistClassroom,
  buildRequestOrigin,
} from '@/lib/server/classroom-storage';

const RECORDS_DIR = path.join(process.cwd(), 'data', 'quiz-records');

export async function POST(req: NextRequest) {
  try {
    const { classroomId, studentId } = await req.json();

    if (!classroomId || !studentId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'classroomId and studentId are required');
    }

    // 1. Load classroom data
    const classroomPath = path.join(CLASSROOMS_DIR, `${classroomId}.json`);
    let classroomData: any;
    try {
      classroomData = JSON.parse(await fs.readFile(classroomPath, 'utf-8'));
    } catch {
      return apiError('NOT_FOUND', 404, 'Classroom not found');
    }

    const allScenes: any[] = classroomData.scenes || [];

    // 2. Load quiz records for this student
    const recordsPath = path.join(RECORDS_DIR, `${classroomId}.jsonl`);
    let records: any[] = [];
    try {
      const raw = await fs.readFile(recordsPath, 'utf-8');
      records = raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l))
        .filter(r => r.studentId === studentId);
    } catch {
      return apiError('NOT_FOUND', 404, 'No quiz records found for this student');
    }

    if (records.length === 0) {
      return apiError('NOT_FOUND', 404, 'No quiz records found for this student');
    }

    // 3. Find wrong question IDs per scene
    const wrongByScene: Record<string, Set<string>> = {};
    for (const record of records) {
      const wrongQs = (record.results || [])
        .filter((r: any) => r.status === 'incorrect')
        .map((r: any) => r.questionId);
      if (wrongQs.length > 0) {
        if (!wrongByScene[record.sceneId]) wrongByScene[record.sceneId] = new Set();
        wrongQs.forEach((q: string) => wrongByScene[record.sceneId].add(q));
      }
    }

    if (Object.keys(wrongByScene).length === 0) {
      return apiError('NO_WRONG_ANSWERS', 400, 'No wrong answers found — student passed all quizzes!');
    }

    // 4. Build remedial scenes
    // For each wrong quiz: include the quiz scene (filtered to wrong questions only)
    // + the preceding slide scenes (as review material)
    const remedialScenes: any[] = [];
    let order = 1;

    // Sort all scenes by order
    const sortedScenes = [...allScenes].sort((a, b) => (a.order || 0) - (b.order || 0));

    for (const [wrongSceneId, wrongQIds] of Object.entries(wrongByScene)) {
      const quizSceneIdx = sortedScenes.findIndex(s => s.id === wrongSceneId);
      if (quizSceneIdx === -1) continue;

      const quizScene = sortedScenes[quizSceneIdx];

      // Find preceding slide scenes (up to 2 slides before this quiz)
      const precedingSlides: any[] = [];
      for (let i = quizSceneIdx - 1; i >= 0 && precedingSlides.length < 2; i--) {
        if (sortedScenes[i].type === 'slide' || sortedScenes[i].type === 'interactive') {
          precedingSlides.unshift(sortedScenes[i]);
        } else {
          break; // Stop at another quiz
        }
      }

      // Add preceding slides as review
      for (const slide of precedingSlides) {
        remedialScenes.push({ ...slide, id: nanoid(), stageId: '', order: order++ });
      }

      // Add quiz with only wrong questions
      const wrongQs = Array.from(wrongQIds);
      const filteredQuestions = (quizScene.content?.questions || []).filter((q: any) =>
        wrongQs.includes(q.id),
      );
      if (filteredQuestions.length > 0) {
        remedialScenes.push({
          ...quizScene,
          id: nanoid(),
          stageId: '',
          order: order++,
          title: `【错题重练】${quizScene.title}`,
          content: {
            ...quizScene.content,
            questions: filteredQuestions,
          },
        });
      }
    }

    if (remedialScenes.length === 0) {
      return apiError('NO_CONTENT', 400, 'Could not build remedial scenes');
    }

    // 5. Create new classroom
    const newId = nanoid(10);
    const originalName = classroomData.stage?.name || classroomId;
    const newStage = {
      id: newId,
      name: `【错题补课】${studentId} — ${originalName}`,
      language: classroomData.stage?.language || 'zh-CN',
      style: classroomData.stage?.style || 'interactive',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const remedialScenesWithStageId = remedialScenes.map(s => ({ ...s, stageId: newId }));

    const baseUrl = buildRequestOrigin(req);
    const persisted = await persistClassroom(
      { id: newId, stage: newStage, scenes: remedialScenesWithStageId },
      baseUrl,
    );

    return apiSuccess({
      id: persisted.id,
      url: persisted.url,
      sceneCount: remedialScenesWithStageId.length,
      wrongQuizCount: Object.keys(wrongByScene).length,
    });
  } catch (error) {
    return apiError('INTERNAL_ERROR', 500, 'Failed to generate remedial classroom', String(error));
  }
}
