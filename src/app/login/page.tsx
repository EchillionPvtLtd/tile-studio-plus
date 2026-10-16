import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOGIN_POSTERS, type LoginPosterData } from "@/lib/loginPosters";
import { LoginClient } from "./LoginClient";

export default async function LoginPage() {
  // Posters are edited from the admin panel, so read them on every request.
  await connection();

  let posters: LoginPosterData[] = [];
  try {
    posters = await prisma.loginPoster.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        imageUrl: true,
        tag: true,
        title: true,
        body: true,
        buttonLabel: true,
        buttonUrl: true,
        sortOrder: true,
        active: true,
      },
    });
  } catch {
    // The login page must still render if the posters table can't be read.
  }

  return <LoginClient posters={posters.length > 0 ? posters : DEFAULT_LOGIN_POSTERS} />;
}
