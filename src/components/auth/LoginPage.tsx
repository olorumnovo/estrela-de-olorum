"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { isPdvAllowedDashboardPath } from "@/lib/access";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, senha }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErro(data.message || "E-mail ou senha inválidos.");
        return;
      }

      const nextPath = new URLSearchParams(window.location.search).get("next");
      const redirectTo =
        typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
          ? data.redirectTo
          : "/dashboard";
      const isPdvRedirect = redirectTo === "/dashboard/pdv";

      if (
        nextPath &&
        nextPath.startsWith("/") &&
        (!isPdvRedirect || isPdvAllowedDashboardPath(nextPath))
      ) {
        if (nextPath.startsWith("/api/")) {
          window.location.assign(nextPath);
          return;
        }

        router.push(nextPath);
        router.refresh();
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setErro("Erro ao conectar com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-[#F5F7FB]">
      <section className="hidden w-1/2 xl:flex items-center justify-center bg-[#07111F]">
        <Image src="/logo.png" alt="Logo" width={320} height={320} priority />
      </section>

      <section className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md rounded-3xl bg-white p-10 shadow-xl">
          <div className="mb-10 text-center xl:hidden">
            <Image
              src="/logo.png"
              alt="Logo"
              width={120}
              height={120}
              className="mx-auto"
            />
          </div>

          <h2 className="text-3xl font-bold text-slate-900">Entrar</h2>
          <p className="mt-2 text-slate-500">
            Informe suas credenciais para acessar o sistema.
          </p>

          {erro ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {erro}
            </div>
          ) : null}

          <form onSubmit={handleLogin} className="mt-10 space-y-6">
            <div>
              <label className="mb-2 block text-sm font-semibold">E-mail</label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 w-full rounded-2xl border border-slate-200 pl-12 pr-4 outline-none focus:border-[#C6921E]"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Senha</label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="h-14 w-full rounded-2xl border border-slate-200 pl-12 pr-14 outline-none focus:border-[#C6921E]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" />
                Lembrar-me
              </label>
              <Link href="#" className="text-sm font-semibold text-[#C6921E]">
                Esqueci minha senha
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-14 w-full rounded-2xl bg-[#C6921E] font-semibold text-white"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-400">
            © 2026 Estrela de Olorum
          </p>
        </div>
      </section>
    </main>
  );
}
