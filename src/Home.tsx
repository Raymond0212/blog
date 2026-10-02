import HomeContent from "@/content/homeContent.mdx";
import { ArrowUpRight } from "lucide-react";
import { useMenuItem } from "@/data/MenuItemContext";

const Home = () => {
  const currentYear = new Date().getFullYear();
  const exp = currentYear - 2022;
  const { menuItems, selectItem } = useMenuItem();
  const latestArticles = menuItems
    .find((item) => item.id === "articles")
    ?.items?.find((item) => item.label === "AI News")
    ?.items?.slice(0, 3);
  const navigate = (id: string) => {
    selectItem(id);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  return (
    <HomeContent
      exp={exp}
      onNavigate={navigate}
      latestWriting={latestArticles?.map((article, index) => (
        <button
          key={article.id}
          type="button"
          className="swiss-writing-row"
          onClick={() => navigate(article.id)}
        >
          <span className="swiss-row-number" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="swiss-writing-info">
            <span className="swiss-eyebrow">AI News</span>
            <span className="swiss-writing-title">{article.label}</span>
          </span>
          <ArrowUpRight className="swiss-row-arrow" aria-hidden="true" />
        </button>
      ))}
    />
  );
};

export default Home;
