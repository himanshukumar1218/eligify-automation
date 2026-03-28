export async function insertScraperLog(client, payload) {
  const { level, eventName, message, metadata = {} } = payload;

  await client.query(
    `
      INSERT INTO scraper_logs (level, event_name, message, metadata)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [level, eventName, message, JSON.stringify(metadata)]
  );
}

export async function clearOldLogs(client, days) {
  await client.query(
    `
      DELETE FROM scraper_logs
      WHERE created_at < NOW() - make_interval(days => $1)
    `,
    [days]
  );
}

export async function clearOrphanedKnowledgeChunks(client) {
  await client.query(
    `
      DELETE FROM exam_knowledge_chunks chunk
      WHERE NOT EXISTS (
        SELECT 1
        FROM discovered_exams exam
        WHERE exam.id = chunk.exam_id
      )
    `
  );
}
