import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@masdan/ui/components/alert";
import { Button } from "@masdan/ui/components/button";
import { Link } from "@tanstack/react-router";

const SignUpForm = (_props: { invitationId?: string; redirectTo: string }) => (
  <div className="flex flex-col gap-4">
    <Alert variant="info">
      <AlertTitle>Sign-up is off in the demo</AlertTitle>
      <AlertDescription>
        Accounts live on the Masdan server. Use the demo account to look around
        instead.
      </AlertDescription>
    </Alert>
    <Button className="w-full" render={<Link to="/login" />} size="lg">
      Go to the demo sign-in
    </Button>
  </div>
);

export default SignUpForm;
