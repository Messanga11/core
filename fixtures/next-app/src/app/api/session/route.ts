import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set("messanga_session", "fixture-session", {
    httpOnly: true,
    maxAge: 900,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
