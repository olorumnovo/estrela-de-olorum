import UserFormClient from "@/components/users-permissions/UserFormClient";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditarUsuarioPage({ params }: Props) {
  const { id } = await params;

  return <UserFormClient userId={id} />;
}
