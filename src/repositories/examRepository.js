export async function getExistingNormalizedTitles(client, normalizedTitles) {
  if (normalizedTitles.length === 0) {
    return new Set();
  }

  const { rows } = await client.query(
    `
      SELECT normalized_title
      FROM discovered_exams
      WHERE normalized_title = ANY($1::text[])
    `,
    [normalizedTitles]
  );

  return new Set(rows.map((row) => row.normalized_title));
}

export async function insertDiscovery(client, exam) {
  const { title, normalizedTitle, portalUrl, discoveredAt } = exam;

  const { rows } = await client.query(
    `
      INSERT INTO discovered_exams (
        title,
        normalized_title,
        portal_url,
        discovery_status,
        discovered_at,
        last_scraped_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'NEW_DISCOVERY', $4, NOW(), NOW())
      ON CONFLICT (normalized_title) DO UPDATE
      SET last_scraped_at = NOW(),
          updated_at = NOW()
      RETURNING *
    `,
    [title, normalizedTitle, portalUrl, discoveredAt]
  );

  return rows[0];
}

export async function updateExamPdf(client, examId, officialPdfUrl, status) {
  const { rows } = await client.query(
    `
      UPDATE discovered_exams
      SET official_pdf_url = $2,
          discovery_status = $3,
          updated_at = NOW(),
          last_scraped_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [examId, officialPdfUrl, status]
  );

  return rows[0];
}

export async function updateExamJson(client, examId, jsonData, status) {
  const { rows } = await client.query(
    `
      UPDATE discovered_exams
      SET json_data = $2::jsonb,
          status = $3,
          discovery_status = 'PARSED_READY_FOR_REVIEW',
          updated_at = NOW(),
          last_scraped_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [examId, JSON.stringify(jsonData), status]
  );

  return rows[0];
}

export async function markExamPublished(client, examId) {
  const { rows } = await client.query(
    `
      UPDATE discovered_exams
      SET status = 'PUBLISHED',
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [examId]
  );

  return rows[0] ?? null;
}

export async function markExamFailed(client, examId, status) {
  await client.query(
    `
      UPDATE discovered_exams
      SET discovery_status = $2,
          updated_at = NOW(),
          last_scraped_at = NOW()
      WHERE id = $1
    `,
    [examId, status]
  );
}

export async function getExamByNormalizedTitle(client, normalizedTitle) {
  const { rows } = await client.query(
    `
      SELECT *
      FROM discovered_exams
      WHERE normalized_title = $1
      LIMIT 1
    `,
    [normalizedTitle]
  );

  return rows[0] ?? null;
}

export async function markExamQueued(client, examId) {
  const { rows } = await client.query(
    `
      UPDATE discovered_exams
      SET discovery_status = 'QUEUED',
          queued_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
        AND queued_at IS NULL
      RETURNING *
    `,
    [examId]
  );

  return rows[0] ?? null;
}

export async function getExamById(client, examId) {
  const { rows } = await client.query(
    `
      SELECT *
      FROM discovered_exams
      WHERE id = $1
      LIMIT 1
    `,
    [examId]
  );

  return rows[0] ?? null;
}

export async function getExamForJob(client, jobData) {
  if (jobData.exam_id) {
    const byId = await getExamById(client, jobData.exam_id);
    if (byId) {
      return byId;
    }
  }

  if (jobData.normalized_title) {
    const byNormalizedTitle = await getExamByNormalizedTitle(client, jobData.normalized_title);
    if (byNormalizedTitle) {
      return byNormalizedTitle;
    }
  }

  if (jobData.portal_url) {
    const { rows } = await client.query(
      `
        SELECT *
        FROM discovered_exams
        WHERE portal_url = $1
        ORDER BY discovered_at DESC
        LIMIT 1
      `,
      [jobData.portal_url]
    );

    if (rows[0]) {
      return rows[0];
    }
  }

  return null;
}

export async function getPendingExamsForRequeue(client, limit = 1) {
  const { rows } = await client.query(
    `
      SELECT *
      FROM discovered_exams
      WHERE official_pdf_url IS NOT NULL
        AND discovery_status IN ('QUEUED', 'PDF_EXTRACTED', 'KNOWLEDGE_READY', 'FAILED')
      ORDER BY discovered_at ASC
      LIMIT $1
    `,
    [limit]
  );

  return rows;
}

export async function listReviewableExams(client) {
  const { rows } = await client.query(
    `
      SELECT id, title, portal_url, official_pdf_url, status, discovery_status, discovered_at, updated_at
      FROM discovered_exams
      WHERE status = 'PARSED_READY_FOR_REVIEW'
      ORDER BY updated_at DESC NULLS LAST, discovered_at DESC
    `
  );

  return rows;
}

export async function getExamJsonById(client, examId) {
  const { rows } = await client.query(
    `
      SELECT id, title, status, discovery_status, json_data, official_pdf_url, portal_url, discovered_at, updated_at
      FROM discovered_exams
      WHERE id = $1
      LIMIT 1
    `,
    [examId]
  );

  return rows[0] ?? null;
}
