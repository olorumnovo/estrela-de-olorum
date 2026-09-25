import MemberForm from "@/components/members/MemberForm";
import { MemberSchema } from "@/components/members/member-schema";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";
import { memberService } from "@/modules/members";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

function toDateInput(value: Date | null) {
  if (!value) return "";

  return value.toISOString().slice(0, 10);
}

function toSexo(value: string | null) {
  if (value === "MALE") return "MASCULINO";
  if (value === "FEMALE") return "FEMININO";

  return "";
}

export default async function EditarMembroPage({
  params,
}: Props) {
  const { id } = await params;
  const user = await requireCurrentUserFromCookies();
  const templeId = user.templeId;

  const [member, options] = await Promise.all([
    memberService.buscar(id, templeId),
    memberService.listarOpcoesFormulario(templeId),
  ]);

  if (!member) {
    return (
      <main className="space-y-6 p-4 sm:p-6 lg:p-7">
        <h1 className="text-3xl font-bold">
          Membro não encontrado
        </h1>
      </main>
    );
  }

  const initialData: MemberSchema = {
    nome: member.nome,
    cpfCnpj: member.cpf ?? "",
    rg: member.rg ?? "",
    estadoCivil: member.estadoCivil ?? "",
    sexo: toSexo(member.genero),
    hierarchyIds:
      member.memberHierarchies.length > 0
        ? member.memberHierarchies.map(
            (item) => item.hierarchyId
          )
        : [member.hierarchyId ?? ""],
    classificationIds:
      member.memberClassifications.length > 0
        ? member.memberClassifications.map(
            (item) => item.classificationId
          )
        : [member.classificationId ?? ""],
    dataNascimento: toDateInput(member.nascimento),
    dataEntrada: toDateInput(member.admissaoCentro),
    dataSaida: toDateInput(member.saidaCentro),
    cep: member.cep ?? "",
    endereco: member.endereco ?? "",
    numero: member.numero ?? "",
    complemento: member.complemento ?? "",
    bairro: member.bairro ?? "",
    cidade: member.cidade ?? "",
    estado: member.estado ?? "",
    celular: member.telefone ?? "",
    email: member.email ?? "",
    entidadePai1: member.fatherEntity1Id ?? "",
    entidadePai2: member.fatherEntity2Id ?? "",
    entidadeMae1: member.motherEntity1Id ?? "",
    entidadeMae2: member.motherEntity2Id ?? "",
    observacoes: member.observacoes ?? "",
    foto: member.foto,
    status:
      member.status === "PENDING"
        ? "PENDING"
        : member.status === "INACTIVE"
          ? "INACTIVE"
        : member.status === "SUSPENDED"
          ? "SUSPENDED"
          : "ACTIVE",
  };

  return (
    <MemberForm
      memberId={member.id}
      initialData={initialData}
      fatherFrontEntities={options.fatherFrontEntities}
      fatherBackEntities={options.fatherBackEntities}
      motherFrontEntities={options.motherFrontEntities}
      motherBackEntities={options.motherBackEntities}
      hierarchies={options.hierarchies}
      classifications={options.classifications}
    />
  );
}
