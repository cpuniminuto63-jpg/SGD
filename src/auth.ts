import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "@/lib/auth/login-rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        if (isRateLimited(email)) return null;

        const [profile] = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
        if (!profile || !profile.active || !profile.passwordHash) {
          recordFailedAttempt(email);
          return null;
        }

        const valid = await bcrypt.compare(password, profile.passwordHash);
        if (!valid) {
          recordFailedAttempt(email);
          return null;
        }
        clearAttempts(email);

        return {
          id: profile.id,
          email: profile.email,
          name: profile.fullName,
          role: profile.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as typeof session.user.role;
      }
      return session;
    },
  },
});
