import { ShoppingCart } from "lucide-react";

export default function SalesCard() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">

      <div className="flex items-center justify-between border-b border-slate-100 px-8 py-6">

        <h2 className="text-3xl font-semibold">
          Vendas do Mês
        </h2>

        <button className="font-medium text-[#C6921E] hover:underline">
          Ver todas
        </button>

      </div>

      <div className="p-8">

        <div className="flex items-center gap-5">

          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F7E8BF]">

            <ShoppingCart
              size={32}
              className="text-[#B8860B]"
            />

          </div>

          <div>

            <p className="text-slate-500">
              Total de Vendas
            </p>

            <h2 className="text-5xl font-bold text-green-700">
              R$ 4.560,00
            </h2>

            <p className="mt-2 text-green-600">
              +12% em relação ao mês anterior
            </p>

          </div>

        </div>

        <div className="mt-10 flex h-36 items-end gap-3">

          {[25, 35, 28, 45, 40, 58, 55, 70, 62, 80].map((v, i) => (

            <div
              key={i}
              className="flex-1 rounded-t-xl bg-[#D4A11E]"
              style={{
                height: `${v}%`,
              }}
            />

          ))}

        </div>

      </div>

    </div>
  );
}