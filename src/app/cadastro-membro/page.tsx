import Image from "next/image";

import PublicMemberRegistrationForm from "./PublicMemberRegistrationForm";

export default function CadastroMembroPage() {
  return (
    <main className="min-h-screen bg-[#F5F7FB] px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt="Logo"
            width={128}
            height={128}
            className="mx-auto"
            priority
          />

          <h1 className="mt-4 text-3xl font-bold text-slate-900">
            Cadastro para se tornar membro
          </h1>
        </div>

        <PublicMemberRegistrationForm />
      </div>
    </main>
  );
}
