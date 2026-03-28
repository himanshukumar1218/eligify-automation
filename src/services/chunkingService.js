const SECTION_OVERLAP = 200;
const MAX_SECTION_LENGTH = 3000;
const EXPLICIT_NOISE_PATTERNS = [
  /उत्तर प्रदेश शिक्षा सेवा चयन आयोग[,\s-]*प्रयागराज/gi,
  /Page\s+\d+\s+of\s+\d+/gi,
  /पृष्ठ\s*\d+\s*में\s*से\s*\d+/gi
];

const SECTION_RULES = [
  { tag: "dates", pattern: /(महत्वपूर्ण\s*तिथियाँ|Important\s+Dates|\bDate\b)/i },
  { tag: "fee", pattern: /(आवेदन\s*शुल्क|Application\s+Fee|\bFee\b)/i },
  { tag: "age", pattern: /(Age Limit|Minimum Age|Maximum Age)/i },
  { tag: "education", pattern: /(Educational Qualification|Qualification|Degree|Diploma)/i },
  { tag: "eligibility", pattern: /(पात्रता|अर्हता|Eligibility|Qualification)/i },
  { tag: "posts", pattern: /(पद\s*का\s*नाम|Name\s+of\s+Post|\bPost\b)/i },
  { tag: "scheme", pattern: /(परीक्षा\s*योजना|Examination\s+Scheme|Syllabus)/i }
];

function estimateTokenCount(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function normalizeWhitespace(text) {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

function stripExplicitNoise(text) {
  let cleaned = text;

  for (const pattern of EXPLICIT_NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  return cleaned;
}

function collectRepeatedBoundaryLines(pages) {
  const counts = new Map();

  for (const page of pages) {
    const lines = page.text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const boundaryLines = [lines[0], lines[1], lines.at(-1), lines.at(-2)].filter(Boolean);

    for (const line of boundaryLines) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }

  return new Set(
    [...counts.entries()]
      .filter(([line, count]) => count >= 2 && line.length > 6)
      .map(([line]) => line)
  );
}

function removeRepeatedBoundaryNoise(text, repeatedLines) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !repeatedLines.has(line))
    .join("\n");
}

function cleanPageText(text, repeatedLines) {
  return normalizeWhitespace(removeRepeatedBoundaryNoise(stripExplicitNoise(text), repeatedLines));
}

function inferTags(text) {
  const matches = SECTION_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.tag);
  return matches.length > 0 ? matches : ["general"];
}

function splitBySemanticHeaders(text) {
  const headerRegex = /(महत्वपूर्ण\s*तिथियाँ|Important\s+Dates|\bDate\b|आवेदन\s*शुल्क|Application\s+Fee|\bFee\b|पात्रता|अर्हता|Eligibility|Qualification|पद\s*का\s*नाम|Name\s+of\s+Post|\bPost\b|परीक्षा\s*योजना|Examination\s+Scheme|Syllabus)/gi;
  const matches = [...text.matchAll(headerRegex)];

  if (matches.length === 0) {
    return [text.trim()].filter(Boolean);
  }

  const sections = [];

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
    const section = text.slice(start, end).trim();

    if (section) {
      sections.push(section);
    }
  }

  const prefix = text.slice(0, matches[0].index ?? 0).trim();
  if (prefix) {
    sections.unshift(prefix);
  }

  return sections;
}

function splitLargeSection(sectionText) {
  if (sectionText.length <= MAX_SECTION_LENGTH) {
    return [sectionText];
  }

  const chunks = [];
  let remaining = sectionText;

  while (remaining.length > MAX_SECTION_LENGTH) {
    const window = remaining.slice(0, MAX_SECTION_LENGTH);
    const paragraphBreak = window.lastIndexOf("\n\n");
    const splitIndex = paragraphBreak > 1000 ? paragraphBreak : MAX_SECTION_LENGTH;
    const current = remaining.slice(0, splitIndex).trim();

    if (current) {
      chunks.push(current);
    }

    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function buildPageSections(page, previousSection) {
  const rawSections = splitBySemanticHeaders(page.text);
  const sections = [];

  for (const rawSection of rawSections) {
    const tags = inferTags(rawSection);
    const expandedSections = splitLargeSection(rawSection);

    for (const expandedSection of expandedSections) {
      sections.push({
        text: expandedSection,
        tags
      });
    }
  }

  if (sections.length === 0 && page.text) {
    sections.push({ text: page.text, tags: ["general"] });
  }

  if (previousSection && sections.length > 0) {
    const first = sections[0];
    const sharesTag = first.tags.some((tag) => previousSection.tags.includes(tag));

    if (sharesTag || first.tags.includes("general")) {
      first.text = `${previousSection.text.slice(-SECTION_OVERLAP)}\n${first.text}`.trim();
      first.tags = [...new Set([...previousSection.tags, ...first.tags])];
    }
  }

  return sections;
}

export function createSemanticChunks(examId, extractedDocument) {
  const pages = extractedDocument.pages ?? [];

  if (pages.length === 0) {
    const text = normalizeWhitespace(stripExplicitNoise(extractedDocument.text ?? ""));

    if (!text) {
      return [];
    }

    return splitLargeSection(text).map((chunkContent, index) => ({
      examId,
      chunkContent,
      pageNumber: 1,
      chunkIndex: index,
      tags: inferTags(chunkContent),
      tokenEstimate: estimateTokenCount(chunkContent),
      tokenCount: estimateTokenCount(chunkContent)
    }));
  }

  const repeatedLines = collectRepeatedBoundaryLines(pages);
  const cleanedPages = pages
    .map((page) => ({
      pageNumber: page.pageNumber,
      text: cleanPageText(page.text ?? "", repeatedLines)
    }))
    .filter((page) => page.text.length > 0);

  const chunks = [];
  let previousSection = null;
  let chunkIndex = 0;

  for (const page of cleanedPages) {
    const sections = buildPageSections(page, previousSection);

    for (const section of sections) {
      const chunkContent = normalizeWhitespace(section.text);

      if (!chunkContent) {
        continue;
      }

      const tokenEstimate = estimateTokenCount(chunkContent);
      const tags = section.tags.length > 0 ? section.tags : ["general"];

      chunks.push({
        examId,
        chunkContent,
        pageNumber: page.pageNumber,
        chunkIndex,
        tags,
        tokenEstimate,
        tokenCount: tokenEstimate
      });

      previousSection = {
        text: chunkContent,
        tags
      };
      chunkIndex += 1;
    }
  }

  return chunks;
}
