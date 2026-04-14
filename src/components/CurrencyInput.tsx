import React, { useState, useEffect } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChange: (value: number) => void;
  isCurrency?: boolean;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({ value, onChange, isCurrency = true, ...props }) => {
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    if (isCurrency) {
      setDisplayValue(formatCurrency(value));
    } else {
      setDisplayValue(value.toString());
    }
  }, [value, isCurrency]);

  const formatCurrency = (val: number) => {
    if (isNaN(val)) return '';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2
    }).format(val);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value;
    
    if (isCurrency) {
      rawValue = rawValue.replace(/\D/g, '');
      const numValue = parseInt(rawValue, 10) / 100;
      
      if (!isNaN(numValue)) {
        setDisplayValue(formatCurrency(numValue));
        onChange(numValue);
      } else {
        setDisplayValue('');
        onChange(0);
      }
    } else {
      // For non-currency (like evasao, matriculas)
      setDisplayValue(rawValue);
      const numValue = parseFloat(rawValue.replace(',', '.'));
      if (!isNaN(numValue)) {
        onChange(numValue);
      } else {
        onChange(0);
      }
    }
  };

  const handleBlur = () => {
    if (!isCurrency) {
      const numValue = parseFloat(displayValue.replace(',', '.'));
      if (!isNaN(numValue)) {
        setDisplayValue(numValue.toString());
      }
    }
  };

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      {...props}
    />
  );
};
