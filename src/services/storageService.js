import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function ensurePdfExtension(fileName) {
  return fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
}

export async function downloadAndUploadPdf(pdfUrl, fileName) {
  const response = await axios.get(pdfUrl, {
    responseType: "arraybuffer",
    timeout: config.pdfRequestTimeoutMs,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 300
  });

  const targetFileName = ensurePdfExtension(fileName);
  const fileBuffer = Buffer.from(response.data);

  const { error: uploadError } = await supabase.storage
    .from(config.storageBucketName)
    .upload(targetFileName, fileBuffer, {
      contentType: "application/pdf",
      upsert: true
    });

  if (uploadError) {
    throw new Error(`Supabase upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage
    .from(config.storageBucketName)
    .getPublicUrl(targetFileName);

  return {
    publicUrl: data.publicUrl,
    buffer: fileBuffer
  };
}

export async function uploadPdfFromUrl(url, fileName) {
  return downloadAndUploadPdf(url, fileName);
}
