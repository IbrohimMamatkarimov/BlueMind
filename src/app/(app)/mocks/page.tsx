import { MockCatalog } from "@/components/MockCatalog";
import { StudentHelp } from "@/components/StudentHelp";

export default function MocksPage() {
  return <>
    <MockCatalog />
    <StudentHelp
      title="SAT study help"
      context="The learner is browsing BlueMind's SAT practice catalog. Ask a focused question about an SAT concept, a practice strategy, or how to approach a question. If they need help with a specific question, ask them to include the relevant text."
    />
  </>;
}

