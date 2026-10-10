import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getSupabaseConfig } from "@/lib/env";
import { GitHubSignIn } from "./github-sign-in";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  const configured = getSupabaseConfig() !== null;

  return (
    <Container size="md" className="flex flex-1 items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Logo variant="mark" className="mb-2 h-10" />
          <CardTitle className="text-2xl">Sign in to Contribo</CardTitle>
          <CardDescription>
            Contribo uses your GitHub account to verify the pull requests you contribute.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <GitHubSignIn configured={configured} />
          </Suspense>
        </CardContent>
      </Card>
    </Container>
  );
}
