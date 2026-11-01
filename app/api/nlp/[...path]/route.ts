export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const backendPaths: Record<string, string> = {
  health: "/health",
  "triage/audio": "/api/triage/audio",
  "triage/text": "/api/triage/text",
};

async function proxyNlpRequest(request: Request, { params }: RouteContext) {
  const { path } = await params;
  const backendPath = backendPaths[path.join("/")];

  if (!backendPath) {
    return Response.json({ error: "NLP endpoint not found." }, { status: 404 });
  }

  const expectedMethod = backendPath === "/health" ? "GET" : "POST";
  if (request.method !== expectedMethod) {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }

  const backendUrl = process.env.NLP_BACKEND_URL;
  if (!backendUrl) {
    return Response.json(
      { error: "NLP backend binding is not configured." },
      { status: 503 }
    );
  }

  const target = new URL(backendPath.slice(1), `${backendUrl.replace(/\/+$/, "")}/`);
  target.search = new URL(request.url).search;

  const headers = new Headers();
  for (const name of ["accept", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
    });

    const responseHeaders = new Headers({ "cache-control": "no-store" });
    const contentType = response.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("NLP backend request failed:", error);
    return Response.json({ error: "NLP backend is unavailable." }, { status: 502 });
  }
}

export async function GET(request: Request, context: RouteContext) {
  return proxyNlpRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyNlpRequest(request, context);
}