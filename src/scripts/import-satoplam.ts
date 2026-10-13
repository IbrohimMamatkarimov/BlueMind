import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile();

import { db } from '../lib/db';
import { newId } from '../lib/id';

async function main() {
  const pdfBuffer = fs.readFileSync('Books/SAToplam Writing Book.pdf');
  const data = await pdf(pdfBuffer);
  const text = data.text;

  const startIdx = text.indexOf('Topic 1: Boundaries');
  const answersIdx = text.indexOf('Answers: Boundaries');
  const endIdx = text.indexOf('Topic 2: Form, Structure, and Sense');
  
  const questionsText = text.substring(startIdx, answersIdx).replace(/@satashkent\n\d+\n/g, '');
  const answersText = text.substring(answersIdx, endIdx);
  
  // Parse answers
  const answers: Record<string, string> = {};
  for (const match of answersText.matchAll(/(\d+)([A-D])/g)) {
    answers[match[1]] = match[2];
  }

  const rawBlocks = questionsText.split(/\n\.\s\.\s\.\s\.\s.*/g);
  
  const questionsToInsert = [];
  let position = 1;

  for (const block of rawBlocks) {
    if (block.trim() === '') continue;
    const m = block.match(/\n(\d+)\n([\s\S]*?\?)\nA\)\s+([\s\S]*?)\nB\)\s+([\s\S]*?)\nC\)\s+([\s\S]*?)\nD\)\s+([\s\S]*)/);
    if (m) {
      const qNum = m[1];
      let prefix = block.substring(0, m.index).trim();
      if (prefix.includes('(*Exam level)')) {
        prefix = prefix.split('(*Exam level)')[1].trim();
      }
      
      const passageText = prefix.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      const questionText = m[2].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      
      const choices = [
        { id: 'A', text: m[3].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(), imageData: null },
        { id: 'B', text: m[4].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(), imageData: null },
        { id: 'C', text: m[5].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(), imageData: null },
        { id: 'D', text: m[6].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(), imageData: null },
      ];
      
      const correctAnswer = answers[qNum];
      if (!correctAnswer) {
        console.warn(`No answer found for question ${qNum}`);
      }

      questionsToInsert.push({
        externalId: `satoplam_b_${String(qNum).padStart(3, '0')}`,
        section: 'Reading and Writing',
        domain: 'Standard English Conventions',
        skill: 'Boundaries',
        difficulty: 'Medium',
        passageText,
        imageData: null,
        questionText,
        choices: JSON.stringify(choices),
        correctAnswer,
        questionType: 'multiple_choice',
        rationale: 'No rationale provided.',
        explanation: 'No explanation provided.',
        estimatedTime: 35,
        source: 'SAToplam Writing Book',
        position: position++,
      });
    }
  }

  console.log(`Parsed ${questionsToInsert.length} questions.`);

  const UPSERT = `INSERT INTO questions
       (id, mock_id, section, domain, skill, difficulty, module, module_pool,
        passage_text, image_data, question_text, choices, correct_answer, question_type,
        rationale, explanation, estimated_time, source, version, review_status, position, external_id)
     VALUES (?, NULL, ?, ?, ?, ?, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'validated', ?, ?)
     ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO UPDATE SET
       section = EXCLUDED.section, domain = EXCLUDED.domain, skill = EXCLUDED.skill,
       difficulty = EXCLUDED.difficulty, module = 1, module_pool = NULL,
       passage_text = EXCLUDED.passage_text, image_data = EXCLUDED.image_data,
       question_text = EXCLUDED.question_text, choices = EXCLUDED.choices,
       correct_answer = EXCLUDED.correct_answer, question_type = EXCLUDED.question_type,
       rationale = EXCLUDED.rationale, explanation = EXCLUDED.explanation,
       estimated_time = EXCLUDED.estimated_time, source = EXCLUDED.source,
       review_status = 'validated', position = EXCLUDED.position,
       version = questions.version + 1,
       updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     RETURNING (xmax = 0) AS inserted`;

  let inserted = 0;
  let updated = 0;
  const BATCH = 50;

  for (let start = 0; start < questionsToInsert.length; start += BATCH) {
    const batch = questionsToInsert.slice(start, start + BATCH);
    await db.transaction(async (tx) => {
      for (const row of batch) {
        const result = await tx.prepare(UPSERT).get(
            newId("q"),
            row.section,
            row.domain,
            row.skill,
            row.difficulty,
            row.passageText,
            row.imageData,
            row.questionText,
            row.choices,
            row.correctAnswer,
            row.questionType,
            row.rationale,
            row.explanation,
            row.estimatedTime,
            row.source,
            row.position,
            row.externalId
        ) as { inserted: boolean } | undefined;
        
        if (result?.inserted) inserted++;
        else updated++;
      }
    });
  }

  console.log(`Inserted: ${inserted}, Updated: ${updated}`);
  await db.close();
}

main().catch(console.error);
