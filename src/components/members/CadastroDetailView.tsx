"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  MoreHorizontal,
  Printer,
  Save,
  Trash2,
  X,
  UserPlus,
  UserX,
} from "lucide-react";

import FloatingDraggablePopover from "@/components/ui/floating-draggable-popover";

type CadastroDetailRecord = {
  id: string;
  code: string;
  name: string;
  fantasy: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  zipCode: string;
  city: string;
  state: string;
  contactNotes: string;
  phone: string;
  cellphone: string;
  email: string;
  personType: string;
  cpfCnpj: string;
  rgIe: string;
  status: string;
  observations: string;
  maritalStatus: string;
  hierarchy: string;
  sex: string;
  birthDate: string;
  admissionDate: string;
  exitDate: string;
  fatherFront: string;
  fatherBack: string;
  motherFront: string;
  motherBack: string;
  classifications: string[];
};

type Props = {
  record: CadastroDetailRecord;
};

function normalizeStatus(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function uniqueLabels(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = normalizeStatus(value);

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

const CLASSIFICATION_OPTIONS = [
  "Cliente",
  "Fornecedor",
  "Transportador",
  "Batizado",
  "Curso de Atabaque A",
  "Curso de Curimba",
  "Desenvolvimento B",
  "Desenvolvimento Mediúnico",
  "Ex-Trabalhador",
  "Teologia A",
  "Teologia B",
  "Teologia C",
  "Teologia D",
  "Teologia E",
  "Teologia F",
  "Teologia G",
  "Teologia H",
  "Teologia I",
  "Teologia J",
  "Teologia K",
  "Teologia L",
  "Trabalhador da Corrente",
  "Outro",
];

type LookupOption = {
  id: string;
  nome: string;
  ativo?: boolean;
};

function fieldValue(value: string) {
  return value?.trim() ? value : "-";
}

function todayPtBr() {
  return new Intl.DateTimeFormat("pt-BR").format(new Date());
}

function ReadOrEdit({
  editing,
  label,
  value,
  onChange,
  multiline = false,
}: {
  editing: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="text-[15px] text-[#6F6A62]">{label}</div>
      {editing ? (
        multiline ? (
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="mt-2 min-h-28 w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[16px] text-[#171717] outline-none focus:border-[#2F5BFF]"
          />
        ) : (
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[16px] text-[#171717] outline-none focus:border-[#2F5BFF]"
          />
        )
      ) : (
        <div className="mt-1 text-[16px] text-[#171717]">
          {fieldValue(value)}
        </div>
      )}
    </div>
  );
}

function SelectOrRead({
  editing,
  label,
  value,
  options,
  onChange,
}: {
  editing: boolean;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="text-[15px] text-[#6F6A62]">{label}</div>
      {editing ? (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full rounded-2xl border border-[#E4D8C2] bg-white px-4 py-3 text-[16px] text-[#171717] outline-none focus:border-[#2F5BFF]"
        >
          <option value="">Selecione</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <div className="mt-1 text-[16px] text-[#171717]">
          {fieldValue(value)}
        </div>
      )}
    </div>
  );
}

export default function CadastroDetailView({ record }: Props) {
  const router = useRouter();
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [moreActionsAnchorRect, setMoreActionsAnchorRect] =
    useState<DOMRect | null>(null);
  const [currentRecord, setCurrentRecord] = useState(record);
  const [editRecord, setEditRecord] = useState(record);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hierarchyOptions, setHierarchyOptions] = useState<string[]>([]);
  const displayRecord = isEditing ? editRecord : currentRecord;
  const isInactiveRecord = normalizeStatus(displayRecord.status) === "inativo";

  const tags = useMemo(
    () => uniqueLabels(displayRecord.classifications.filter(Boolean)),
    [displayRecord.classifications],
  );

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest('[data-cadastro-detail-popover="true"]')) {
        return;
      }

      setShowMoreActions(false);
      setMoreActionsAnchorRect(null);
    }

    document.addEventListener("mousedown", closeMenu);

    return () => {
      document.removeEventListener("mousedown", closeMenu);
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/hierarchies", { cache: "no-store" })
      .then((response) => response.json())
      .then((items: LookupOption[]) => {
        if (!active || !Array.isArray(items)) {
          return;
        }

        setHierarchyOptions(
          items
            .filter((item) => item.ativo !== false)
            .map((item) => item.nome)
            .filter(Boolean),
        );
      })
      .catch(() => {
        if (active) {
          setHierarchyOptions([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function openPrintableWindow(title: string, content: string) {
    const popup = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=980,height=720",
    );

    if (!popup) {
      window.alert(
        "Não foi possível abrir a nova janela. Verifique o bloqueador de pop-up.",
      );
      return;
    }

    popup.document.write(`<!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${title}</title>
          <style>
            @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
            body { font-family: "Plus Jakarta Sans", Arial, sans-serif; color: #171717; margin: 32px; }
            h1 { font-size: 28px; margin-bottom: 10px; }
            p { margin: 6px 0; line-height: 1.6; }
            .box { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-top: 16px; }
            .tag { display: inline-block; background: #6b7280; color: white; border-radius: 999px; padding: 5px 10px; margin: 6px 6px 0 0; font-size: 12px; }
          </style>
        </head>
        <body>${content}</body>
      </html>`);
    popup.document.close();
    popup.focus();
  }

  function buildSummary() {
    return `
      <div class="box">
        <p><strong>Contato:</strong> ${displayRecord.name}</p>
        <p><strong>CPF/CNPJ:</strong> ${fieldValue(displayRecord.cpfCnpj)}</p>
        <p><strong>Cidade:</strong> ${fieldValue(displayRecord.city)}</p>
        <p><strong>Celular:</strong> ${fieldValue(displayRecord.cellphone)}</p>
        <p><strong>E-mail:</strong> ${fieldValue(displayRecord.email)}</p>
        <p><strong>Data de admissão:</strong> ${fieldValue(displayRecord.admissionDate)}</p>
        <p><strong>Data de saída:</strong> ${fieldValue(displayRecord.exitDate)}</p>
        <p><strong>Classificações:</strong> ${tags.length ? tags.map((tag) => `<span class="tag">${tag}</span>`).join("") : "-"}</p>
      </div>
    `;
  }

  async function sendCadastroMutation(
    method: "PATCH" | "DELETE",
    body?: Record<string, unknown>,
  ) {
    const requestOptions: RequestInit = {
      method,
      ...(body
        ? {
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        : {}),
    };

    const primaryResponse = await fetch(
      `/api/cadastros/${currentRecord.id}`,
      requestOptions,
    );
    const primaryData = await primaryResponse.json().catch(() => null);

    if (primaryResponse.ok) {
      return primaryData;
    }

    const fallbackResponse = await fetch(
      `/api/members/${currentRecord.id}`,
      requestOptions,
    );
    const fallbackData = await fallbackResponse.json().catch(() => null);

    if (!fallbackResponse.ok) {
      throw new Error(
        fallbackData?.message ||
          fallbackData?.error ||
          primaryData?.message ||
          primaryData?.error ||
          "Não foi possível concluir a ação.",
      );
    }

    return fallbackData;
  }

  async function handleDeactivateCadastro() {
    if (
      !window.confirm(
        `Deseja realmente inativar o cadastro de ${displayRecord.name}?`,
      )
    ) {
      return;
    }

    try {
      await sendCadastroMutation("PATCH", {
        status: "INACTIVE",
      });

      const nextRecord = {
        ...currentRecord,
        status: "inativo",
        exitDate: todayPtBr(),
      };

      setCurrentRecord(nextRecord);
      setEditRecord(nextRecord);
      router.refresh();
      window.alert("Cadastro inativado com sucesso.");
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Não foi possível inativar o cadastro.",
      );
    }
  }

  async function handleActivateCadastro() {
    if (
      !window.confirm(
        `Deseja realmente ativar o cadastro de ${displayRecord.name}?`,
      )
    ) {
      return;
    }

    try {
      await sendCadastroMutation("PATCH", {
        status: "ACTIVE",
      });

      const nextRecord = {
        ...currentRecord,
        status: "ativo",
        exitDate: "",
      };

      setCurrentRecord(nextRecord);
      setEditRecord(nextRecord);
      router.refresh();
      window.alert("Cadastro ativado com sucesso.");
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Não foi possível ativar o cadastro.",
      );
    }
  }

  async function handleDeleteCadastro() {
    if (
      !window.confirm(
        `Deseja realmente excluir o cadastro de ${displayRecord.name}? Essa ação remove o cadastro da listagem.`,
      )
    ) {
      return;
    }

    try {
      await sendCadastroMutation("DELETE");

      window.alert("Cadastro excluído com sucesso.");
      router.push("/dashboard/membros");
      router.refresh();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o cadastro.",
      );
    }
  }

  function changeEditField(field: keyof CadastroDetailRecord, value: string) {
    setEditRecord((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleClassification(option: string) {
    setEditRecord((current) => {
      const exists = current.classifications.includes(option);

      return {
        ...current,
        classifications: exists
          ? current.classifications.filter((item) => item !== option)
          : [...current.classifications, option],
      };
    });
  }

  function startEditing() {
    setEditRecord(currentRecord);
    setIsEditing(true);
  }

  async function saveCadastro() {
    if (!editRecord.name.trim()) {
      window.alert("Informe o nome do cadastro.");
      return;
    }

    setSaving(true);

    try {
      const payload =
        normalizeStatus(editRecord.status) === "inativo" &&
        !editRecord.exitDate.trim()
          ? {
              ...editRecord,
              exitDate: todayPtBr(),
            }
          : editRecord;

      const response = await fetch(`/api/cadastros/${currentRecord.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message || data?.error || "Não foi possível salvar o cadastro.",
        );
      }

      const savedRecord =
        payload.status === "pendente" && payload.hierarchy.trim()
          ? { ...payload, status: "ativo" }
          : payload;

      setCurrentRecord(savedRecord);
      setEditRecord(savedRecord);
      setIsEditing(false);
      router.refresh();
      window.alert("Cadastro atualizado com sucesso.");
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o cadastro.",
      );
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setEditRecord(currentRecord);
    setIsEditing(false);
  }

  return (
    <main className="min-h-[calc(100vh-116px)] bg-white px-5 py-5 text-[#171717] sm:px-6 lg:px-8">
      <section className="bg-white">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-[#AEA79B]">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 rounded-full border border-[#E4D8C2] px-4 py-2 text-[#171717] transition hover:bg-[#FAF8F3]"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2F5BFF] text-white">
                <ArrowLeft size={12} />
              </span>
              voltar
            </button>
            <span>início</span>
            <span>=</span>
            <span>cadastros</span>
            <span className="font-medium text-[#171717]">
              membros
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-[15px] text-[#171717]">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={saveCadastro}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-[#2F5BFF] px-5 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={16} />
                  {saving ? "salvando..." : "salvar"}
                </button>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full border border-[#E4D8C2] px-5 py-2.5 font-semibold text-[#171717] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X size={16} />
                  cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center gap-2 rounded-full bg-[#2F5BFF] px-5 py-2.5 font-semibold text-white"
              >
                editar
              </button>
            )}
            <div data-cadastro-detail-popover="true" className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setMoreActionsAnchorRect(
                    event.currentTarget.getBoundingClientRect(),
                  );
                  setShowMoreActions((current) => !current);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[#E4D8C2] px-4 py-2.5"
              >
                mais ações
                <MoreHorizontal size={16} />
              </button>

              {showMoreActions && (
                <FloatingDraggablePopover
                  anchorRect={moreActionsAnchorRect}
                  onClose={() => {
                    setShowMoreActions(false);
                    setMoreActionsAnchorRect(null);
                  }}
                  placement="bottom-end"
                  width={340}
                  className="w-[340px] overflow-hidden rounded-2xl border border-[#E8E1D4] bg-white shadow-[0_20px_40px_rgba(0,0,0,0.12)]"
                >
                  <div className="flex items-center gap-3 border-b border-[#EEE7D9] px-5 py-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2F5BFF] text-white">
                      <MoreHorizontal size={16} />
                    </div>
                    <div className="truncate text-[15px] font-medium text-[#171717]">
                      {displayRecord.name}
                    </div>
                  </div>

                  <div className="border-b border-[#EEE7D9] px-3 py-2">
                    {[
                      {
                        label: isInactiveRecord
                          ? "ativar cadastro"
                          : "inativar cadastro",
                        icon: isInactiveRecord ? UserPlus : UserX,
                        action: isInactiveRecord
                          ? handleActivateCadastro
                          : handleDeactivateCadastro,
                      },
                      {
                        label: "excluir cadastro",
                        icon: Trash2,
                        action: handleDeleteCadastro,
                        danger: true,
                      },
                      {
                        label: "imprimir ficha cadastral",
                        icon: Printer,
                        action: () =>
                          openPrintableWindow(
                            `Ficha Cadastral - ${displayRecord.name}`,
                            `<h1>Ficha Cadastral</h1>${buildSummary()}<script>window.onload=()=>window.print()</script>`,
                          ),
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            item.action();
                            setShowMoreActions(false);
                          }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-[#4E4A43] transition hover:bg-[#FAF8F3]"
                        >
                          <Icon
                            size={16}
                            className={
                              item.danger ? "text-red-500" : "text-[#6F6A62]"
                            }
                          />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </FloatingDraggablePopover>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-[1060px]">
          <div>
            <h1 className="text-[18px] font-semibold text-[#171717]">
              Contato
            </h1>
            <p className="mt-1 text-[16px] text-[#4B4B4B]">
              {displayRecord.name}
            </p>
          </div>

          <div className="mt-8 border-b border-[#E7E0D3]" />

          <div className="space-y-10 py-8">
            <div className="space-y-8 py-8">
              <section className="space-y-8 border-b border-[#E7E0D3] pb-8">
                <ReadOrEdit
                  editing={isEditing}
                  label="Nome"
                  value={displayRecord.name}
                  onChange={(value) => changeEditField("name", value)}
                />

                <div className="grid gap-6 md:grid-cols-4">
                  <ReadOrEdit
                    editing={isEditing}
                    label="Tipo de pessoa"
                    value={displayRecord.personType}
                    onChange={(value) => changeEditField("personType", value)}
                  />
                  <ReadOrEdit
                    editing={isEditing}
                    label="CPF"
                    value={displayRecord.cpfCnpj}
                    onChange={(value) => changeEditField("cpfCnpj", value)}
                  />
                  <ReadOrEdit
                    editing={isEditing}
                    label="RG"
                    value={displayRecord.rgIe}
                    onChange={(value) => changeEditField("rgIe", value)}
                  />
                </div>

                {isEditing ? (
                  <div className="space-y-3">
                    <div className="text-[15px] text-[#6F6A62]">
                      Classificações e funções
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {CLASSIFICATION_OPTIONS.map((option) => {
                        const checked =
                          editRecord.classifications.includes(option);

                        return (
                          <label
                            key={option}
                            className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-[14px] transition ${
                              checked
                                ? "border-[#2F5BFF] bg-[#EEF3FF] text-[#173A99]"
                                : "border-[#E4D8C2] bg-white text-[#171717] hover:bg-[#FAF8F3]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleClassification(option)}
                              className="h-4 w-4 accent-[#2F5BFF]"
                            />
                            {option}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[#7C7C7C] px-3 py-1 text-[12px] font-medium text-white"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )
                )}
              </section>

              <section className="space-y-8 border-b border-[#E7E0D3] pb-8">
                <h2 className="text-[18px] font-semibold">Dados religiosos</h2>

                <div className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <SelectOrRead
                      editing={isEditing}
                      label="Hierarquia"
                      value={displayRecord.hierarchy}
                      options={hierarchyOptions}
                      onChange={(value) => changeEditField("hierarchy", value)}
                    />
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <ReadOrEdit
                      editing={isEditing}
                      label="Pai de Frente"
                      value={displayRecord.fatherFront}
                      onChange={(value) =>
                        changeEditField("fatherFront", value)
                      }
                    />
                    <ReadOrEdit
                      editing={isEditing}
                      label="Mãe de Frente"
                      value={displayRecord.motherFront}
                      onChange={(value) =>
                        changeEditField("motherFront", value)
                      }
                    />
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <ReadOrEdit
                      editing={isEditing}
                      label="Pai de Costas"
                      value={displayRecord.fatherBack}
                      onChange={(value) =>
                        changeEditField("fatherBack", value)
                      }
                    />
                    <ReadOrEdit
                      editing={isEditing}
                      label="Mãe de Costas"
                      value={displayRecord.motherBack}
                      onChange={(value) =>
                        changeEditField("motherBack", value)
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-8 border-b border-[#E7E0D3] pb-8">
                <h2 className="text-[18px] font-semibold">Endereço</h2>

                <div className="grid gap-6 md:grid-cols-3">
                  <ReadOrEdit
                    editing={isEditing}
                    label="CEP"
                    value={displayRecord.zipCode}
                    onChange={(value) => changeEditField("zipCode", value)}
                  />
                  <ReadOrEdit
                    editing={isEditing}
                    label="Município"
                    value={displayRecord.city}
                    onChange={(value) => changeEditField("city", value)}
                  />
                  <ReadOrEdit
                    editing={isEditing}
                    label="UF"
                    value={displayRecord.state}
                    onChange={(value) => changeEditField("state", value)}
                  />
                </div>

                <ReadOrEdit
                  editing={isEditing}
                  label="Endereço"
                  value={displayRecord.address}
                  onChange={(value) => changeEditField("address", value)}
                />

                <div className="grid gap-6 md:grid-cols-3">
                  <ReadOrEdit
                    editing={isEditing}
                    label="Bairro"
                    value={displayRecord.neighborhood}
                    onChange={(value) => changeEditField("neighborhood", value)}
                  />
                  <ReadOrEdit
                    editing={isEditing}
                    label="Número"
                    value={displayRecord.number}
                    onChange={(value) => changeEditField("number", value)}
                  />
                  <ReadOrEdit
                    editing={isEditing}
                    label="Complemento"
                    value={displayRecord.complement}
                    onChange={(value) => changeEditField("complement", value)}
                  />
                </div>
              </section>

              <section className="space-y-8">
                <h2 className="text-[18px] font-semibold">Contato</h2>

                <div className="grid gap-6 md:grid-cols-3">
                  <ReadOrEdit
                    editing={isEditing}
                    label="Celular"
                    value={displayRecord.cellphone}
                    onChange={(value) => changeEditField("cellphone", value)}
                  />
                  <ReadOrEdit
                    editing={isEditing}
                    label="Telefone"
                    value={displayRecord.phone}
                    onChange={(value) => changeEditField("phone", value)}
                  />
                </div>

                <ReadOrEdit
                  editing={isEditing}
                  label="E-mail"
                  value={displayRecord.email}
                  onChange={(value) => changeEditField("email", value)}
                />
              </section>
            </div>

            <section className="space-y-6 border-b border-[#E7E0D3] pb-8">
              <h2 className="text-[18px] font-semibold">
                Dados complementares
              </h2>
              <div className="grid gap-8 md:grid-cols-2">
                <SelectOrRead
                  editing={isEditing}
                  label="Estado civil"
                  value={displayRecord.maritalStatus}
                  options={[
                    "Solteiro",
                    "Casado",
                    "Divorciado",
                    "Viúvo",
                    "União estável",
                  ]}
                  onChange={(value) => changeEditField("maritalStatus", value)}
                />
                <SelectOrRead
                  editing={isEditing}
                  label="Sexo"
                  value={displayRecord.sex}
                  options={["masculino", "feminino", "outro"]}
                  onChange={(value) => changeEditField("sex", value)}
                />
                <ReadOrEdit
                  editing={isEditing}
                  label="Data de nascimento"
                  value={displayRecord.birthDate}
                  onChange={(value) => changeEditField("birthDate", value)}
                />
                <ReadOrEdit
                  editing={isEditing}
                  label="Data de admissão"
                  value={displayRecord.admissionDate}
                  onChange={(value) => changeEditField("admissionDate", value)}
                />
                <ReadOrEdit
                  editing={isEditing}
                  label="Data de saída"
                  value={displayRecord.exitDate}
                  onChange={(value) => changeEditField("exitDate", value)}
                />
              </div>
            </section>

            <section className="space-y-4 border-b border-[#E7E0D3] pb-8">
              <h2 className="text-[18px] font-semibold">Anexos</h2>
              <div className="text-[16px] text-[#6F6A62]">
                Nenhum anexo disponível para este cadastro no momento.
              </div>
            </section>

            <section className="space-y-8 pb-8">
              <h2 className="text-[18px] font-semibold">Observações</h2>
              <ReadOrEdit
                editing={isEditing}
                label="Observações"
                value={displayRecord.observations}
                multiline
                onChange={(value) => changeEditField("observations", value)}
              />
              <ReadOrEdit
                editing={isEditing}
                label="Observações do contato"
                value={displayRecord.contactNotes}
                multiline
                onChange={(value) => changeEditField("contactNotes", value)}
              />
              <SelectOrRead
                editing={isEditing}
                label="Situação"
                value={displayRecord.status}
                options={["ativo", "inativo", "pendente", "suspenso"]}
                onChange={(value) => changeEditField("status", value)}
              />
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
