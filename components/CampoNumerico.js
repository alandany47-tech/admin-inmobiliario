"use client";

import { useEffect, useRef, useState } from "react";

function normalizarExterno(value) {
  return value === 0 || value === "" || value == null ? "" : String(value);
}

/**
 * Input numérico controlado que evita los bugs típicos de un <input type="number">
 * manejado a mano: mostrar "0" al vaciar el campo y concatenar dígitos ("012") al
 * escribir sobre un cero. `value` acepta number|string|null/undefined; `onChange`
 * siempre recibe un string (vacío o numérico), listo para convertir con
 * Number()/parseFloat() en el caller al usarlo en cálculos.
 */
export default function CampoNumerico({ value, onChange, className = "", onFocus, onBlur, ...props }) {
  const [texto, setTexto] = useState(() => normalizarExterno(value));
  const enfocado = useRef(false);

  useEffect(() => {
    if (!enfocado.current) {
      setTexto(normalizarExterno(value));
    }
  }, [value]);

  function manejarCambio(e) {
    let bruto = e.target.value;
    if (/^0[0-9]/.test(bruto)) {
      bruto = bruto.replace(/^0+/, "");
    }
    setTexto(bruto);
    onChange(bruto);
  }

  return (
    <input
      type="number"
      value={texto}
      onFocus={(e) => {
        enfocado.current = true;
        e.target.select();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        enfocado.current = false;
        setTexto(normalizarExterno(value));
        onBlur?.(e);
      }}
      onChange={manejarCambio}
      className={className}
      {...props}
    />
  );
}
