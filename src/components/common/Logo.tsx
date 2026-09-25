import Image from "next/image";

export default function Logo() {
  return (
    <div className="flex flex-col items-center">

      <Image
        src="/logo.png"
        alt="Estrela de Olorum"
        width={170}
        height={170}
        priority
        className="w-44 object-contain"
      />

    </div>
  );
}