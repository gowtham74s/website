"use client";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { DataProvider } from "@/lib/data";
import { ToastProvider } from "./ui";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DataProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </DataProvider>
  );
}
