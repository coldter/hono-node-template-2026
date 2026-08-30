import { Logo } from "@/assets/logo";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/modules/ui/carousel";
import { SellingPoint } from "./selling-point";

const sellingPoints = [
  {
    bgGradient: "from-indigo-600 via-purple-600 to-pink-500",
    description: "Sign in to access your dashboard and manage your projects",
    key: "welcome",
    title: "Welcome Back",
  },
  {
    bgGradient: "from-emerald-500 via-teal-500 to-cyan-500",
    description: "Built for performance with real-time updates",
    key: "fast",
    title: "Fast and Reliable",
  },
  {
    bgGradient: "from-orange-500 via-red-500 to-pink-500",
    description: "Your data is protected with enterprise-grade security",
    key: "secure",
    title: "Secure by Design",
  },
  {
    bgGradient: "from-blue-600 via-indigo-600 to-violet-600",
    description: "Designed with simplicity and usability in mind",
    key: "intuitive",
    title: "Intuitive Interface",
  },
];

export function LoginLeftPanel() {
  return (
    <div className="relative h-screen overflow-hidden">
      <div className="p-8">
        <Logo className="h-8 w-8" />
      </div>

      <div className="flex h-full items-center justify-center">
        <Carousel
          autoplay
          autoplayDelay={5000}
          className="h-full w-full [&>div]:h-full [&>div]:min-h-full"
          opts={{
            align: "center",
            loop: true,
          }}
        >
          <CarouselContent className="h-full">
            {sellingPoints.map((point) => (
              <CarouselItem className="p-8 pt-0 pb-32" key={point.key}>
                <div className="h-full min-h-full overflow-hidden rounded-xl shadow-lg">
                  <SellingPoint
                    bgGradient={point.bgGradient}
                    description={point.description}
                    title={point.title}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="top-auto bottom-30 left-12" />
          <CarouselNext className="top-auto right-12 bottom-30" />
        </Carousel>
      </div>
    </div>
  );
}
