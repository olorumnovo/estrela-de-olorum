import MemberForm from "@/components/members/MemberForm";
import { requireCurrentUserFromCookies } from "@/lib/server-auth";
import { memberService } from "@/modules/members";


export default async function NovoMembroPage() {
  const user = await requireCurrentUserFromCookies();
  const templeId = user.templeId;
  const options =
    await memberService.listarOpcoesFormulario(
      templeId
    );

  return (
    <MemberForm
      fatherFrontEntities={options.fatherFrontEntities}
      fatherBackEntities={options.fatherBackEntities}
      motherFrontEntities={options.motherFrontEntities}
      motherBackEntities={options.motherBackEntities}
      hierarchies={options.hierarchies}
      classifications={options.classifications}
    />
  );
}
