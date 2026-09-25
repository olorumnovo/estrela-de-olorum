import PasswordSettingsForm from "./PasswordSettingsForm";
import SettingsBackButton from "@/components/settings/SettingsBackButton";

export default function SenhaPage() {
  return (
    <main className="space-y-6 p-4 sm:p-6 lg:p-7">
      <div className="space-y-4">
        <SettingsBackButton />
        <h1 className="text-3xl font-bold text-slate-900">
          Trocar Senha
        </h1>

        <p className="mt-2 text-slate-500">
          Atualize a senha do usuário logado.
        </p>
      </div>

      <PasswordSettingsForm />
    </main>
  );
}
