"use client";

export function DeleteUserForm({
  action,
  profileId,
  fullName,
}: {
  action: (formData: FormData) => void;
  profileId: string;
  fullName: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `¿Eliminar a ${fullName}? Esto solo funciona si no tiene historial registrado; si ya revisó algo, usa "Desactivar" en su lugar.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="profile_id" value={profileId} />
      <button
        type="submit"
        className="rounded-md border border-status-no-esta/40 px-3 py-1 text-xs font-medium text-status-no-esta hover:bg-status-no-esta/10"
      >
        Eliminar
      </button>
    </form>
  );
}
