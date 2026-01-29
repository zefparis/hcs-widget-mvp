import { WidgetRunner } from '@/components/widget/WidgetRunner';

export default async function WidgetPage({
  params,
}: {
  params: Promise<{ widgetId: string }>;
}) {
  const { widgetId } = await params;
  
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <WidgetRunner widgetId={widgetId} />
    </div>
  );
}
