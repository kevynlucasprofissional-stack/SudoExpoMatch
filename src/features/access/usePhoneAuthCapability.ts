import { useQuery } from "@tanstack/react-query";

import { getPhoneAuthCapability } from "@/lib/phone-auth.functions";
import { CAPABILITY_DISABLED, type PhoneAuthCapability } from "@/lib/phone-auth";

/**
 * Capability do ambiente: o acesso por OTP só aparece na UI quando o
 * provedor de telefone está realmente habilitado. Enquanto não estiver,
 * o fallback por código de recuperação permanece como único caminho.
 */
export function usePhoneAuthCapability(): PhoneAuthCapability & {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["phone-auth-capability"],
    queryFn: () => getPhoneAuthCapability(),
    staleTime: 5 * 60 * 1000,
    // Falha de rede é transitória: tenta de novo antes de declarar indisponível.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });
  return {
    ...(data ?? CAPABILITY_DISABLED),
    isLoading: isPending,
    isError,
    refetch: () => void refetch(),
  };
}

