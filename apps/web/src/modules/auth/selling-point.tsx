import { motion } from "framer-motion";

interface SellingPointProps {
  bgGradient?: string;
  bgImage?: string;
  description: string;
  title: string;
}

export function SellingPoint({
  title,
  description,
  bgImage,
  bgGradient = "from-indigo-600 via-purple-600 to-pink-500",
}: SellingPointProps) {
  return (
    <div className="relative flex h-full select-none flex-col justify-center p-8">
      {bgImage ? (
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          height={600}
          src={bgImage}
          width={800}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-linear-to-br ${bgGradient}`}
        />
      )}
      <div className="relative z-10 flex flex-col items-center justify-center">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="mb-2 text-center font-bold text-5xl text-white drop-shadow-2xl">
            {title}
          </h2>
        </motion.div>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.1, duration: 0.6 }}
        >
          <p className="text-center text-lg text-white/80 leading-relaxed">
            {description}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
