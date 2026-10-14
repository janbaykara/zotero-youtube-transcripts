import type { HttpClient, HttpRequest } from "../youtube/http";

export const zoteroHttp: HttpClient = {
  async request(req: HttpRequest): Promise<string> {
    const xhr = await Zotero.HTTP.request(req.method, req.url, {
      headers: req.headers,
      body: req.body,
      responseType: "text",
      // Captions / InnerTube can be slow on large videos.
      timeout: 60000,
    });
    return String(xhr.responseText ?? "");
  },
};
