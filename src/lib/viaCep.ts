export type ViaCepResponse = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
};

export async function buscarCep(cep: string): Promise<ViaCepResponse | null> {
  const somenteNumeros = cep.replace(/\D/g, "");

  if (somenteNumeros.length !== 8) {
    return null;
  }

  try {
    const response = await fetch(
      `https://viacep.com.br/ws/${somenteNumeros}/json/`
    );

    if (!response.ok) {
      return null;
    }

    const data: ViaCepResponse = await response.json();

    if (data.erro) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}