import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import ResendProvider from "next-auth/providers/resend";
import { Resend } from "resend";

import { db } from "@/server/db";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      bio: string | null;
      displayName: string | null;
      handle: string | null;
      image: string | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    bio: string | null;
    displayName: string | null;
    handle: string | null;
  }
}

export const authConfig = {
  providers: [
    ResendProvider({
      apiKey: process.env.AUTH_RESEND_KEY!,
      from: "Bubbly Maps <auth@bubblymaps.org>",
      sendVerificationRequest: async ({ identifier: email, url, provider }) => {
        const resend = new Resend(provider.apiKey);

        const { data, error } = await resend.emails.send({
          from: provider.from!,
          to: email,
          subject: "Sign in to Bubbly Maps",
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Sign in to Bubbly Maps</title>
              </head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #2563eb; margin: 0;">Bubbly Maps</h1>
                  <p style="color: #6b7280; margin: 5px 0;">Find water fountains near you</p>
                </div>
                
                <div style="background-color: #f8fafc; padding: 30px; border-radius: 8px; margin-bottom: 30px;">
                  <h2 style="color: #1f2937; margin: 0 0 20px 0;">Welcome!</h2>
                  <p style="margin: 0 0 20px 0;">Click the button below to sign in to your Bubbly account:</p>
                  
                  <a href="${url}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">Sign In</a>
                  
                  <p style="margin: 20px 0 0 0; font-size: 14px; color: #6b7280;">
                    This link will expire in 24 hours.
                  </p>
                </div>
                
                <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; font-size: 14px; color: #6b7280;">
                  <p style="margin: 0 0 10px 0;">
                    If you didn't request this, please immediately contact us at <a href="mailto:support@bubblymaps.org" style="color: #2563eb;">support@bubblymaps.org</a>.
                  </p>
                </div>
              </body>
            </html>
          `,
        });

        if (error) {
          const msg = typeof error === "object" && error !== null && "message" in error
            ? (error as any).message
            : JSON.stringify(error);
          throw new Error(`Failed to send verification email: ${msg}`);
        }
      },
    }),
  ],
  adapter: PrismaAdapter(db),
  callbacks: {
    session: ({ session, user }) => {
      const appUser = user as typeof user & {
        bio?: string | null;
        displayName?: string | null;
        handle?: string | null;
      };

      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
          bio: appUser.bio ?? null,
          displayName: appUser.displayName ?? null,
          handle: appUser.handle ?? null,
          image: user.image,
        },
      };
    },
  },
} satisfies NextAuthConfig;
