import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { studioBounce } from "./lib/gate/studio";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/** Locale routing, with the studio open only on this machine for now: elsewhere it bounces to the home page. */
const proxy = (request: NextRequest) => {
  const host = request.headers.get("host");
  const bounce = studioBounce(request.nextUrl.pathname, host, Boolean(process.env.VERCEL));
  if (bounce) {
    // Kept on the host and scheme the visitor asked for, which a self-hosted request URL may not carry.
    const url = request.nextUrl.clone();
    url.pathname = bounce;
    url.search = "";
    if (host) {
      url.host = host;
      url.port = /:(\d+)$/.exec(host)?.[1] ?? "";
    }
    const proto = request.headers.get("x-forwarded-proto");
    if (proto) url.protocol = proto;
    return NextResponse.redirect(url, 307);
  }
  return intl(request);
};

export default proxy;

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
