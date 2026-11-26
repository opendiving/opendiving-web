// The file iOS reads to hand this instance's links to the app `IOS_APP_ID` names, and to
// let that app use this instance's passkeys. Apple fetches it with no redirect allowed and
// wants `application/json` whatever the path says.
//
// `connection()` keeps the read in the container: without a request-time API Next
// prerenders the handler and the build machine's environment, which names no app, would
// answer for every instance.

import { connection } from "next/server";

import { appSiteAssociation } from "@/lib/app-site-association";
import { runtimeConfig } from "@/lib/runtime-config";

export async function GET(): Promise<Response> {
  await connection();

  const { iosAppId } = runtimeConfig();
  if (!iosAppId) return new Response(null, { status: 404 });

  return Response.json(appSiteAssociation(iosAppId));
}
