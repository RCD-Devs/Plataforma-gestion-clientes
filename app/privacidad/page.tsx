import Image from "next/image";

export const metadata = {
  title: "Aviso de privacidad — REVO",
};

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-[#f4f6f8] py-10">
      <div className="mx-auto w-full max-w-2xl px-4">
        <div className="mb-6 flex items-center gap-2">
          <Image src="/brand/logo.png" alt="REVO" width={120} height={53} />
          <div className="text-lg font-semibold">Aviso de privacidad</div>
        </div>

        <div className="space-y-5 rounded-2xl border border-[#e6e8eb] bg-white p-6 text-sm leading-relaxed text-[#374151]">
          <p className="text-xs text-[#6b7280]">
            Última actualización: 16 de septiembre de 2026. Este es un aviso
            preliminar para el piloto de la plataforma — no reemplaza una
            revisión legal formal antes de un lanzamiento comercial completo.
          </p>

          <section>
            <h2 className="mb-1 font-semibold text-[#111827]">
              ¿Quién es responsable de tus datos?
            </h2>
            <p>
              <strong>Grupo Revo</strong> es responsable del tratamiento de
              los datos personales que recibe a través de esta plataforma
              (formulario de solicitudes y portal de clientes).
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-[#111827]">
              Qué datos recopilamos
            </h2>
            <p>
              Nombre de tu empresa, tu correo de contacto, el contenido de las
              solicitudes que envías (título, descripción, prioridad, fecha
              requerida) y los archivos que adjuntas.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-[#111827]">
              Para qué los usamos
            </h2>
            <p>
              Exclusivamente para gestionar tus solicitudes, hacer
              seguimiento del servicio contratado (bolsa de horas) y
              notificarte por correo sobre cambios de estado. No vendemos ni
              compartimos tus datos con terceros para fines de marketing.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-[#111827]">
              Con quién se procesan
            </h2>
            <p>
              Usamos proveedores de infraestructura para operar la
              plataforma: Supabase (base de datos y almacenamiento de
              archivos) y Resend (envío de correos). Estos proveedores
              procesan los datos en nuestro nombre, bajo sus propias
              políticas de seguridad.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-[#111827]">
              Cuánto tiempo los conservamos
            </h2>
            <p>
              Mientras dure la relación comercial con tu empresa. Si dejas de
              ser cliente y quieres que eliminemos tus datos antes de ese
              plazo, puedes solicitarlo por el medio de contacto abajo.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold text-[#111827]">
              Tus derechos
            </h2>
            <p>
              Puedes pedir acceder, corregir o eliminar tus datos personales
              escribiendo a{" "}
              <a
                href="mailto:desarrollo@rompecabeza.cl"
                className="font-medium text-[#08a89f] underline"
              >
                desarrollo@rompecabeza.cl
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
