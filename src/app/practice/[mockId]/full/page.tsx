import FullExam from "@/components/FullExam";

export default function FullExamPage({ params }: { params: { mockId: string } }) {
  return <FullExam key={params.mockId} mockId={params.mockId} />;
}
