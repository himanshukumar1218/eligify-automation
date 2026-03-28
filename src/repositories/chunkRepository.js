export async function deleteChunksByExamId(client, examId) {
  await client.query(
    `
      DELETE FROM exam_knowledge_chunks
      WHERE exam_id = $1
    `,
    [examId]
  );
}

export async function bulkInsertChunks(client, chunks) {
  if (chunks.length === 0) {
    return;
  }

  const values = [];
  const placeholders = [];

  chunks.forEach((chunk, index) => {
    const offset = index * 6;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}::text[])`
    );
    values.push(
      chunk.examId,
      chunk.chunkContent,
      chunk.chunkIndex,
      chunk.pageNumber,
      chunk.tokenCount,
      chunk.tags
    );
  });

  await client.query(
    `
      INSERT INTO exam_knowledge_chunks (
        exam_id,
        chunk_content,
        chunk_index,
        page_number,
        token_count,
        tags
      )
      VALUES ${placeholders.join(", ")}
    `,
    values
  );
}
