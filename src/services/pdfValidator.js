import axios from "axios";
import { config } from "../config.js";
import { isPdfUrl } from "../utils/url.js";

export async function validatePdfUrl(url) {
  if (!isPdfUrl(url)) {
    return false;
  }

  try {
    const response = await axios.get(url, {
      timeout: config.pdfRequestTimeoutMs,
      maxRedirects: 5,
      responseType: "stream",
      validateStatus: () => true
    });

    response.data.destroy();
    return response.status === 200;
  } catch {
    return false;
  }
}
