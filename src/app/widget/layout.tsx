import "../globals.css";

export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="bg-white dark:bg-zinc-950">
        {children}
      </body>
    </html>
  );
}
