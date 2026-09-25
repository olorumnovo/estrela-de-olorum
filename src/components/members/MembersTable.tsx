"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";

import { nameMatchesSearchSuggestion, normalizeSearchText } from "@/lib/search";

type MemberListItem = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  foto: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
  admissaoCentro?: string | null;
  saidaCentro?: string | null;
  hierarchy: {
    nome: string;
  } | null;
  classification: {
    nome: string;
  } | null;
  memberHierarchies: Array<{
    hierarchy: {
      nome: string;
    };
  }>;
  memberClassifications: Array<{
    classification: {
      nome: string;
    };
  }>;
};

type FilterKey =
  | "ALL"
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "PENDING"
  | "BATIZADO";

type Props = {
  members: MemberListItem[];
  fixedFilter?: Exclude<FilterKey, "ALL" | "BATIZADO">;
};

function normalize(value: string) {
  return normalizeSearchText(value);
}

function hasClassification(
  member: MemberListItem,
  classification: string
) {
  const names = getMemberClassificationNames(member).map(normalize);

  return names.includes(normalize(classification));
}

function getMemberClassificationNames(member: MemberListItem) {
  return Array.from(
    new Set(
      [
        member.classification?.nome ?? "",
        ...member.memberClassifications.map(
          (item) => item.classification.nome
        ),
      ]
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export default function MembersTable({
  members,
  fixedFilter,
}: Props) {
  const router = useRouter();
  const [memberItems, setMemberItems] =
    useState(members);
  const [search, setSearch] = useState("");
  const [searchSuggestionIndex, setSearchSuggestionIndex] = useState(0);
  const [searchSuggestionsOpen, setSearchSuggestionsOpen] = useState(false);
  const [activeFilter, setActiveFilter] =
    useState<FilterKey>(fixedFilter ?? "ALL");
  const [activeClassification, setActiveClassification] =
    useState<string>("ALL");
  const [showMoreClassifications, setShowMoreClassifications] =
    useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const filterOptions = useMemo(
    () => [
      {
        key: "ALL" as const,
        label: "Todos",
        count: memberItems.length,
      },
      {
        key: "ACTIVE" as const,
        label: "Ativos",
        count: memberItems.filter(
          (member) => member.status === "ACTIVE"
        ).length,
      },
      {
        key: "INACTIVE" as const,
        label: "Inativos",
        count: memberItems.filter(
          (member) => member.status === "INACTIVE"
        ).length,
      },
      {
        key: "SUSPENDED" as const,
        label: "Suspensos",
        count: memberItems.filter(
          (member) => member.status === "SUSPENDED"
        ).length,
      },
      {
        key: "PENDING" as const,
        label: "Pendentes",
        count: memberItems.filter(
          (member) => member.status === "PENDING"
        ).length,
      },
      {
        key: "BATIZADO" as const,
        label: "Batizados",
        count: memberItems.filter((member) =>
          hasClassification(member, "Batizado")
        ).length,
      },
    ],
    [memberItems]
  );

  const classificationOptions = useMemo(() => {
    const counts = new Map<string, number>();

    memberItems.forEach((member) => {
      getMemberClassificationNames(member).forEach((classification) => {
        counts.set(
          classification,
          (counts.get(classification) || 0) + 1
        );
      });
    });

    return [
      {
        key: "ALL",
        label: "todos",
        count: memberItems.length,
      },
      ...Array.from(counts.entries())
        .sort((left, right) => {
          if (right[1] !== left[1]) {
            return right[1] - left[1];
          }

          return left[0].localeCompare(right[0], "pt-BR");
        })
        .map(([label, count]) => ({
          key: label,
          label,
          count,
        })),
    ];
  }, [memberItems]);

  const visibleClassificationOptions = classificationOptions.slice(0, 6);
  const moreClassificationOptions = classificationOptions.slice(6);

  const filteredMembers = useMemo(() => {
    const term = normalize(search);
    return memberItems.filter((member) => {
      const matchesSearch =
        !term ||
        [member.nome, member.cpf ?? "", member.telefone ?? ""].some(
          (value) => normalize(value).includes(term)
        );

      const matchesFilter =
        fixedFilter
          ? member.status === fixedFilter
          : activeFilter === "ALL"
          ? true
          : activeFilter === "BATIZADO"
          ? hasClassification(member, "Batizado")
          : member.status === activeFilter;

      const matchesClassification =
        activeClassification === "ALL"
          ? true
          : hasClassification(member, activeClassification);

      return matchesSearch && matchesFilter && matchesClassification;
    });
  }, [
    activeClassification,
    activeFilter,
    fixedFilter,
    memberItems,
    search,
  ]);

  const totalPages = Math.max(
    Math.ceil(filteredMembers.length / perPage),
    1
  );
  const searchSuggestions = useMemo(() => {
    const term = normalize(search);

    if (term.length < 2) {
      return [];
    }

    return memberItems
      .filter((member) => nameMatchesSearchSuggestion(member.nome, term))
      .slice(0, 10);
  }, [memberItems, search]);

  const paginatedMembers = useMemo(() => {
    const start = (page - 1) * perPage;

    return filteredMembers.slice(start, start + perPage);
  }, [filteredMembers, page, perPage]);

  async function excluir(id: string) {
    const ok = confirm(
      "Deseja realmente excluir este membro?"
    );

    if (!ok) return;

    const response = await fetch(
      `/api/members/${id}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      alert("Erro ao excluir membro.");
      return;
    }

    router.refresh();
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleFilterChange(value: FilterKey) {
    setActiveFilter(value);
    setPage(1);
  }

  function handleClassificationChange(value: string) {
    setActiveClassification(value);
    setShowMoreClassifications(false);
    setPage(1);
  }

  function handlePerPageChange(value: number) {
    setPerPage(value);
    setPage(1);
  }

  async function toggleStatus(
    member: MemberListItem
  ) {
    const nextStatus =
      member.status === "ACTIVE"
        ? "INACTIVE"
        : member.status === "INACTIVE"
        ? "ACTIVE"
        : null;

    if (!nextStatus) {
      return;
    }

    const previous = memberItems;

    setMemberItems((current) =>
      current.map((item) =>
        item.id === member.id
          ? {
              ...item,
              status: nextStatus,
            }
          : item
      )
    );

    const response = await fetch(
      `/api/members/${member.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: nextStatus,
        }),
      }
    );

    if (!response.ok) {
      setMemberItems(previous);
      alert("Erro ao atualizar status.");
      return;
    }

    router.refresh();
  }

  return (
    <>
      <div className="rounded-[28px] border border-[#ECE7DB] bg-white p-5 shadow-sm">

        <div className="flex flex-col gap-4">

          <div className="relative flex-1">

            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              value={search}
              onFocus={() => setSearchSuggestionsOpen(true)}
              onBlur={() => setSearchSuggestionsOpen(false)}
              onChange={(event) => {
                setSearchSuggestionIndex(0);
                setSearchSuggestionsOpen(true);
                handleSearch(event.target.value);
              }}
              onKeyDown={(event) => {
                if (!searchSuggestions.length) {
                  return;
                }

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSearchSuggestionIndex((current) =>
                    Math.min(current + 1, searchSuggestions.length - 1)
                  );
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSearchSuggestionIndex((current) => Math.max(current - 1, 0));
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  const selected = searchSuggestions[searchSuggestionIndex];

                  if (selected) {
                    setSearchSuggestionIndex(0);
                    setSearchSuggestionsOpen(false);
                    handleSearch(selected.nome);
                  }
                }
              }}
              placeholder="Pesquisar por nome, CPF ou telefone..."
              className="h-12 w-full rounded-2xl border border-[#E9E1D2] pl-11 pr-4 outline-none"
            />

            {searchSuggestionsOpen && searchSuggestions.length > 0 && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-40 max-h-72 w-full overflow-y-auto rounded-2xl border border-[#E9E1D2] bg-white p-2 shadow-xl">
                {searchSuggestions.map((member, index) => (
                  <button
                    key={member.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setSearchSuggestionIndex(0);
                      setSearchSuggestionsOpen(false);
                      handleSearch(member.nome);
                    }}
                    className={`flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm ${
                      index === searchSuggestionIndex
                        ? "bg-[#EEF4FF] text-[#1D3E92]"
                        : "text-[#1D1B18] hover:bg-[#F7F4EE]"
                    }`}
                  >
                    <span className="font-semibold">{member.nome}</span>
                    <span className="text-xs text-[#8B8478]">
                      {[member.cpf, member.telefone].filter(Boolean).join(" • ") || "Membro"}
                    </span>
                  </button>
                ))}
              </div>
            )}

          </div>

        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!fixedFilter &&
            filterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() =>
                  handleFilterChange(option.key)
                }
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeFilter === option.key
                    ? "bg-[#171717] text-white"
                    : "border border-[#E9E1D2] bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {option.label} ({option.count})
              </button>
            ))}

          {fixedFilter && (
            <>
              {visibleClassificationOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() =>
                    handleClassificationChange(option.key)
                  }
                  className={`min-w-fit rounded-full px-4 py-2 text-left text-sm font-medium transition ${
                    activeClassification === option.key
                      ? "border-b-2 border-[#171717] text-[#171717]"
                      : "text-[#5F5A52] hover:text-[#171717]"
                  }`}
                >
                  <span className="block whitespace-nowrap">
                    {option.label}
                  </span>
                  <span className="block text-[12px] font-semibold">
                    {String(option.count).padStart(2, "0")}
                  </span>
                </button>
              ))}

              {moreClassificationOptions.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setShowMoreClassifications((current) => !current)
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-[#D5DCEA] bg-white px-4 py-2 text-sm font-medium text-[#5F5A52] transition hover:border-[#9AB2FF] hover:text-[#171717]"
                  >
                    mais
                    <MoreHorizontal size={16} />
                  </button>

                  {showMoreClassifications && (
                    <div className="absolute right-0 top-full z-20 mt-2 w-[320px] rounded-2xl border border-[#ECE7DB] bg-white p-3 shadow-xl">
                      <div className="mb-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setShowMoreClassifications(false)
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-[#D5DCEA] bg-white px-4 py-2 text-sm font-medium text-[#5F5A52]"
                        >
                          mais
                          <MoreHorizontal size={16} />
                        </button>
                      </div>

                      <div className="space-y-1">
                        {moreClassificationOptions.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() =>
                              handleClassificationChange(option.key)
                            }
                            className={`flex w-full items-center justify-between rounded-xl px-4 py-2 text-left text-sm transition ${
                              activeClassification === option.key
                                ? "bg-[#F3F6FF] text-[#171717]"
                                : "text-[#5F5A52] hover:bg-[#FAF8F3]"
                            }`}
                          >
                            <span className="truncate">
                              {option.label.toLowerCase()}
                            </span>
                            <span className="ml-4 shrink-0 text-[12px] font-semibold text-[#6F6A62]">
                              {String(option.count).padStart(2, "0")}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <select
            value={perPage}
            onChange={(event) =>
              handlePerPageChange(
                Number(event.target.value)
              )
            }
            className="rounded-full border border-[#E9E1D2] bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none"
          >
            {[10, 20, 50, 100].map((value) => (
              <option key={value} value={value}>
                {value}/pagina
              </option>
            ))}
          </select>
        </div>

      </div>

      <div className="overflow-hidden rounded-[28px] border border-[#ECE7DB] bg-white shadow-sm">

        <div className="overflow-x-auto">

        <table className="w-full min-w-[860px]">

          <thead>

            <tr className="border-b border-[#EEE7D9] text-left text-sm text-[#7A746A]">

              <th className="px-6 py-4">
                Foto
              </th>

              <th>
                Nome
              </th>

              <th>
                Telefone
              </th>

              <th>
                Hierarquia
              </th>

                <th>
                  Classificação
                </th>

                <th>
                  Entrada
                </th>

                <th>
                  Saída
                </th>

                <th>
                  Status
                </th>

              <th className="pr-6 text-right">
                Ações
              </th>

            </tr>

          </thead>

          <tbody>

            {filteredMembers.length === 0 && (

              <tr>

                <td
                  colSpan={9}
                className="py-20 text-center text-[#8B8478]"
                >
                  Nenhum membro cadastrado.
                </td>

              </tr>

            )}

            {paginatedMembers.map((member) => (

              <tr
                key={member.id}
                className="border-b border-[#F0E9DC] hover:bg-slate-50"
              >

                <td className="px-6 py-4">

                  {member.foto ? (

                    <Image
                      src={member.foto}
                      alt={member.nome}
                      width={44}
                      height={44}
                      className="h-11 w-11 rounded-full object-cover"
                    />

                  ) : (

                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F2EEE5] font-bold text-[#6E675C]">

                      {member.nome.charAt(0)}

                    </div>

                  )}

                </td>

                <td className="font-medium">
                  {member.nome}
                </td>

                <td>
                  {member.telefone ?? "-"}
                </td>

                <td>
                  {member.memberHierarchies.length > 0
                    ? member.memberHierarchies
                        .map(
                          (item) =>
                            item.hierarchy.nome
                        )
                        .join(", ")
                    : member.hierarchy?.nome ?? "-"}
                </td>

                <td>
                  {member.memberClassifications
                    .length > 0
                    ? member.memberClassifications
                        .map(
                          (item) =>
                            item.classification.nome
                        )
                        .join(", ")
                    : member.classification?.nome ?? "-"}
                </td>

                <td>
                  {formatDate(member.admissaoCentro)}
                </td>

                <td>
                  {formatDate(member.saidaCentro)}
                </td>

                <td>

                  <button
                    type="button"
                    onClick={() => toggleStatus(member)}
                    disabled={
                      member.status !== "ACTIVE" &&
                      member.status !== "INACTIVE"
                    }
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        member.status === "ACTIVE"
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : member.status === "INACTIVE"
                          ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : member.status === "PENDING"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {member.status === "ACTIVE"
                      ? "Ativo"
                      : member.status === "INACTIVE"
                        ? "Inativo"
                      : member.status === "PENDING"
                        ? "Pendente"
                        : "Suspenso"}
                  </button>

                </td>

                <td className="pr-6">

                  <div className="flex justify-end gap-2">

                    <Link
                      href={`/dashboard/membros/${member.id}`}
                      className="rounded-lg border border-[#E9E1D2] p-2 hover:bg-slate-100"
                    >
                      <Pencil size={18} />
                    </Link>

                    <button
                      type="button"
                      onClick={() => excluir(member.id)}
                      className="rounded-lg border border-red-200 p-2 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={18} />
                    </button>

                  </div>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm text-slate-500">
          <span>Total: {filteredMembers.length}</span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() =>
                setPage((current) => current - 1)
              }
              className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-50"
            >
              Anterior
            </button>

            <span>
              Pagina {page} de {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((current) => current + 1)
              }
              className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-50"
            >
              Proxima
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
