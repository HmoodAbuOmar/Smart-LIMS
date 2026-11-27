package com.smartlims.examples;

import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

/**
 * Local switch only. A remote database never receives these examples, and the
 * switch file is not part of the application archive.
 */
public class LocalLaboratoryExamplesCondition implements Condition {
    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        String url = context.getEnvironment().getProperty("spring.datasource.url", "");
        boolean local = url.contains("localhost") || url.contains("127.0.0.1");
        boolean requested = "true".equalsIgnoreCase(context.getEnvironment().getProperty("smartlims.examples.laboratory"));
        return local && (requested || flagPresent());
    }

    static boolean flagPresent() {
        return Files.isRegularFile(Path.of("lab-examples.enabled"))
                || Files.isRegularFile(Path.of("Backend", "lab-examples.enabled"));
    }
}
