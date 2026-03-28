import { config } from "../config.js";

const GEMINI_TIMEOUT_MS = 180000;

const SYSTEM_PROMPT = `Extract structured information from the following government exam notification text and return ONLY a valid JSON object. 

### System Instructions
You are a Senior Data Architect specializing in Indian Government Recruitment. Your task is to extract data from bilingual (Hindi/English) text and map it to a specific database schema.

### Strict Output Rules
1. No Conversational Text: Do not include "Here is the JSON" or any preamble. Return only the raw {...} object.
2. Translation: The input text contains Hindi. You must interpret the meaning and provide all JSON values in English.
3. No Guessing: If a field is not explicitly present in the text, use null. Never hallucinate data.
4. Dates: Use 'YYYY-MM-DD' format. 

### Schema Logic Rules
1. Education Criteria: Always include "allowed_programmes" and "allowed_branches" as arrays. If all are allowed, use []. Do NOT omit these fields from the JSON.
2. Relaxation Categories: Use ONLY these keys: ['SC', 'ST', 'OBC', 'EWS', 'UR']. 
   - If 'SC/ST' are mentioned together, create two separate objects in the relaxation array with the same years.
   - Use "relaxation_years" only for age relaxation.
3. Application Fees: Map values to: UR, OBC, SC, ST, EWS. Use null if a category is not mentioned.
4. Post Normalization: Create a separate entry in the "posts" array for every distinct role/job mentioned. Do not merge posts with different eligibility.

### Target JSON Structure
{
  "exam": {
    "exam_name": "",
    "organisation": "",
    "sector": "",
    "status": "",
    "official_link": "",
    "notification_date": "",
    "application_start": "",
    "application_end": "",
    "last_correction_date": "",
    "age_criteria_date": "",
    "admit_card_release_date": "",
    "exam_city_details_date": "",
    "exam_date": "",
    "result_release_date": "",
    "application_fees": {
      "UR": null, "OBC": null, "SC": null, "ST": null, "EWS": null
    },
    "allowed_states": []
  },
  "posts": [
    {
      "post_name": "",
      "department": "",
      "min_age": null,
      "max_age": null,
      "allowed_genders": [],
      "relaxations": [
        { "category": "", "relaxation_years": null }
      ],
      "education_criteria": [
        {
          "required_qualification": "",
          "allowed_programmes": [],
          "allowed_branches": [],
          "min_percentage": null,
          "final_year_allowed": false
        }
      ],
      "special_requirements": {
        "experience_criteria": { "min_years": null, "field": "" },
        "physical_criteria": {},
        "domicile_required": false,
        "domicile_states": []
      }
    }
  ]
}

### Source Data (Bilingual Text Chunks)
[INSERT YOUR COMBINED CHUNKS HERE]`;

function stripMarkdownFences(rawText) {
  return rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function buildChunksText(chunks) {
  return chunks
    .sort((left, right) => left.chunkIndex - right.chunkIndex)
    .map((chunk) => `Chunk ${chunk.chunkIndex} | Page ${chunk.pageNumber ?? "unknown"}\n${chunk.chunkContent}`)
    .join("\n\n");
}

function buildNetworkErrorMessage(error, context) {
  const parts = [
    `Gemini network request failed for model ${context.model}`,
    `chunkCount=${context.chunkCount}`,
    `payloadChars=${context.payloadChars}`
  ];

  if (error?.name) {
    parts.push(`name=${error.name}`);
  }

  if (error?.message) {
    parts.push(`message=${error.message}`);
  }

  if (error?.cause?.message) {
    parts.push(`cause=${error.cause.message}`);
  }

  return parts.join(" | ");
}

export async function extractExamData(chunks) {
  const combinedChunks = buildChunksText(chunks);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    let response;

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json"
            },
            systemInstruction: {
              parts: [
                {
                  text: SYSTEM_PROMPT
                }
              ]
            },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `Recruitment notification chunks:\n\n${combinedChunks}`
                  }
                ]
              }
            ]
          }),
          signal: controller.signal
        }
      );
    } catch (error) {
      throw new Error(
        buildNetworkErrorMessage(error, {
          model: config.geminiModel,
          chunkCount: chunks.length,
          payloadChars: combinedChunks.length
        })
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("")?.trim();

    if (!rawText) {
      throw new Error("Gemini returned an empty response");
    }

    const cleaned = stripMarkdownFences(rawText);

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      throw new Error(`Gemini returned invalid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
