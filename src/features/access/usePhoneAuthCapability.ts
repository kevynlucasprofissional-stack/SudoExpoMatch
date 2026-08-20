import { useQuery } from "@tanstack/react-query";

import { getPhoneAuthCapability } from "@/lib/phone-auth.functions";
import { CAPABILITY_DISABLED, type PhoneAuthCapability } from "@/lib/phone-auth";

/**
 * Capability do ambiente: o acesso por OTP só aparece na UI quando o
 * provedor de telefone está realmente habilitado. Enquanto não estiver,
 * o fallback por código de recuperação permanece como único caminho.
 */
export function usePhoneAuthCapability(): PhoneAuthCapability {
  const { data } = useQuery({
    queryKey: ["phone-auth-capability"],
    queryFn: () => getPhoneAuthCapability(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data ?? CAPABILITY_DISABLED;
}
