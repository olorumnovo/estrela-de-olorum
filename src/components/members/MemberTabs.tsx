"use client";

type Props = {
  tab: string;
  setTab: (tab: string) => void;
};

const tabs = [
  {
    id: "geral",
    label: "Geral",
  },
  {
    id: "contato",
    label: "Contato",
  },
  {
    id: "religioso",
    label: "Religioso",
  },
  {
    id: "observacoes",
    label: "Observações",
  },
];

export default function MemberTabs({
  tab,
  setTab,
}: Props) {
  return (
    <div className="rounded-2xl bg-white p-2 shadow">

      <div className="flex flex-wrap gap-2">

        {tabs.map((item) => (

          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-6 py-3 text-sm font-semibold transition ${
              tab === item.id
                ? "bg-[#C6921E] text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </button>

        ))}

      </div>

    </div>
  );
}