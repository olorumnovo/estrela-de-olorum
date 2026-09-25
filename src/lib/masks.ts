export function onlyNumbers(value: string): string {
  return value.replace(/\D/g, "");
}

export function maskCep(value: string): string {
  value = onlyNumbers(value).slice(0, 8);

  return value.replace(/^(\d{5})(\d)/, "$1-$2");
}

export function maskPhone(value: string): string {
  value = onlyNumbers(value).slice(0, 11);

  if (value.length <= 10) {
    return value
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return value
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export function maskCpf(value: string): string {
  value = onlyNumbers(value).slice(0, 11);

  return value
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function maskCnpj(value: string): string {
  value = onlyNumbers(value).slice(0, 14);

  return value
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskCpfCnpj(value: string): string {
  const numbers = onlyNumbers(value);

  if (numbers.length <= 11) {
    return maskCpf(numbers);
  }

  return maskCnpj(numbers);
}

export function maskRg(value: string): string {
  const rg = value
    .toUpperCase()
    .replace(/[^0-9X]/g, "");

  if (rg.length <= 2) return rg;

  if (rg.length <= 5) {
    return rg.replace(/^(\d{2})([0-9X]+)/, "$1.$2");
  }

  if (rg.length <= 8) {
    return rg.replace(
      /^(\d{2})(\d{3})([0-9X]+)/,
      "$1.$2.$3"
    );
  }

  return rg.replace(
    /^(\d{2})(\d{3})(\d{3})([0-9X]+)/,
    "$1.$2.$3-$4"
  );
}
