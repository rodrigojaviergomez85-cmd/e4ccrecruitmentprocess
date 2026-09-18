import { createFileRoute } from "@tanstack/react-router";

const payload = new Uint8Array(2 * 1024 * 1024);

export const Route = createFileRoute("/api/public/speed-test")({
  server: {
    handlers: {
      GET: async () =>
        new Response(payload, {
          headers: { "content-type": "application/octet-stream", "cache-control": "no-store" },
        }),
      POST: async ({ request }) => {
        const size = (await request.arrayBuffer()).byteLength;
        return Response.json({ received: size }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});