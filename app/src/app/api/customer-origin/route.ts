import dgram from "node:dgram";
import { NextResponse } from "next/server";
import { requireAnyAuthenticated } from "@/lib/auth";

function getLanAddress(): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    socket.once("error", () => {
      socket.close();
      resolve(null);
    });
    try {
      socket.connect(80, "8.8.8.8", () => {
        const address = socket.address().address;
        socket.close();
        resolve(address);
      });
    } catch {
      resolve(null);
    }
  });
}

export async function GET(request: Request) {
  const auth = await requireAnyAuthenticated();
  if (!auth.ok) return auth.response;

  const requestUrl = new URL(request.url);
  const lanAddress = await getLanAddress();
  if (!lanAddress) {
    return NextResponse.json({ origin: requestUrl.origin });
  }

  const port = requestUrl.port ? `:${requestUrl.port}` : "";
  return NextResponse.json({ origin: `${requestUrl.protocol}//${lanAddress}${port}` });
}