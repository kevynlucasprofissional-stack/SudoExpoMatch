import { ShieldCheck } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WhatsappAccessCard } from "./WhatsappAccessCard";
import { usePhoneAuthCapability } from "./usePhoneAuthCapability";
import { maskPhone } from "@/lib/phone-auth";

interface Props {
  open: boolean;
  /** WhatsApp informado no cadastro — não editável aqui. */
  phone: string;
  onVerified: () => void;
}

/**
 * Verificação obrigatória do WhatsApp no fim do cadastro.
 *
 * Não fecha sozinho: o participante precisa confirmar o código de uso único
 * enviado para o número informado. O telefone e o código vivem apenas em
 * estado local do cartão de acesso — nunca URL, storage ou logs.
 */
export function PhoneVerificationDialog({ open, phone, onVerified }: Props) {
  const capability = usePhoneAuthCapability();

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="phone-verification-dialog"
      >
        <DialogHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <DialogTitle className="text-white">Confirme seu WhatsApp</DialogTitle>
          <DialogDescription>
            Enviamos um código de uso único para {maskPhone(phone)}. Ele é a forma de entrar no seu
            perfil em qualquer aparelho.
          </DialogDescription>
        </DialogHeader>

        {capability.otpEnabled ? (
          <WhatsappAccessCard
            capability={capability}
            initialPhone={phone}
            lockPhone
            confirmLabel="Confirmar e continuar"
            hint="Verificação obrigatória: seu acesso passa a ser pelo WhatsApp confirmado."
            onVerified={onVerified}
          />
        ) : (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            O envio de código está indisponível no momento. Tente novamente em alguns minutos.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
