import PracticeExam from "@/components/PracticeExam";

export default function PracticePage({ params }: { params: { mockId: string; section: string; module: string } }) {
  return <PracticeExam key={`${params.mockId}/${params.section}/${params.module}`} params={params} />;
}
