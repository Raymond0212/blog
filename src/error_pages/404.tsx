import BackToHome from "./BackToHomeButton";

export default function PageNotFound() {
  return (
    <>
      {/*
        This example requires updating your template:

        ```
        <html class="h-full">
        <body class="h-full">
        ```
      */}
      <main className="grid min-h-full place-items-center px-6 py-24 sm:py-32 lg:px-8">
        <div className="text-center">
          <p className="text-base font-semibold">404</p>
          <h1 className="mt-4 text-balance text-5xl font-semibold tracking-tight sm:text-7xl">
            Page not found
          </h1>
          <p className="mt-6 text-pretty text-lg secondary-foreground font-medium sm:text-xl/8">
            Sorry, we couldn't find the page you're looking for.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <BackToHome />
          </div>
        </div>
      </main>
    </>
  );
}
